import Database from "better-sqlite3";
import { DB_PATH, ensureDirs } from "./paths";
import type { CameraStream, ViolationReport, ChatMessage, VideoSession } from "./types";

let _db: Database.Database | null = null;
let _dbInitError: string | null = null;

/** Last database initialization failure (e.g. on read-only serverless FS). */
export function getDatabaseError(): string | null {
  return _dbInitError;
}

export function isDatabaseReady(): boolean {
  try {
    getDb();
    return true;
  } catch {
    return false;
  }
}

function getDb(): Database.Database {
  if (_db) return _db;
  if (_dbInitError) {
    throw new Error(_dbInitError);
  }
  try {
    ensureDirs();
    _db = new Database(DB_PATH);
  } catch (err) {
    _dbInitError =
      err instanceof Error ? err.message : "Database initialization failed.";
    throw new Error(_dbInitError);
  }
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rtsp_url TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      stream_id TEXT NOT NULL,
      stream_name TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      video_timestamp REAL NOT NULL,
      video_timestamp_label TEXT NOT NULL,
      chunk_path TEXT NOT NULL,
      duration_seconds REAL NOT NULL,
      cashier_description TEXT NOT NULL,
      customer_description TEXT NOT NULL,
      summary TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      severity TEXT NOT NULL,
      confidence REAL NOT NULL,
      screenshots TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_detected_at ON reports(detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_stream ON reports(stream_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      report_refs TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_created_at ON chat_messages(created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS video_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      frame_paths TEXT NOT NULL,
      duration_seconds REAL NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Lightweight migrations.
  const reportCols = _db.prepare("PRAGMA table_info(reports)").all() as {
    name: string;
  }[];
  if (!reportCols.some((c) => c.name === "evidence_indices")) {
    _db.exec("ALTER TABLE reports ADD COLUMN evidence_indices TEXT");
  }

  const streamCols = _db.prepare("PRAGMA table_info(streams)").all() as {
    name: string;
  }[];
  if (!streamCols.some((c) => c.name === "source_type")) {
    _db.exec(
      "ALTER TABLE streams ADD COLUMN source_type TEXT NOT NULL DEFAULT 'rtsp'"
    );
  }
  if (!streamCols.some((c) => c.name === "source_config")) {
    _db.exec("ALTER TABLE streams ADD COLUMN source_config TEXT");
  }

  const chatCols = _db.prepare("PRAGMA table_info(chat_messages)").all() as {
    name: string;
  }[];
  if (!chatCols.some((c) => c.name === "video_session_id")) {
    _db.exec("ALTER TABLE chat_messages ADD COLUMN video_session_id TEXT");
  }

  // Startup sanity: no stream can actually be in an active state right now —
  // the process just booted and no poller / ffmpeg child has been spawned yet.
  // Clear stale "recording"/"analyzing" statuses so the UI matches reality
  // after a crash, server restart, or Next.js HMR reload.
  _db
    .prepare(
      `UPDATE streams SET status = 'idle', error_message = NULL
        WHERE status IN ('recording', 'analyzing')`
    )
    .run();

  return _db;
}

function rowToStream(row: Record<string, unknown>): CameraStream {
  const sourceType =
    (row.source_type as CameraStream["sourceType"] | undefined) ?? "rtsp";
  let sourceConfig: CameraStream["sourceConfig"] = null;
  const rawCfg = row.source_config as string | null | undefined;
  if (rawCfg) {
    try {
      sourceConfig = JSON.parse(rawCfg);
    } catch {
      sourceConfig = null;
    }
  }
  return {
    id: row.id as string,
    name: row.name as string,
    rtspUrl: row.rtsp_url as string,
    status: row.status as CameraStream["status"],
    createdAt: row.created_at as number,
    lastActiveAt: (row.last_active_at as number | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    sourceType,
    sourceConfig,
  };
}

function rowToReport(row: Record<string, unknown>): ViolationReport {
  const screenshots: string[] = JSON.parse((row.screenshots as string) || "[]");
  let evidenceIndices: number[] = [];
  try {
    if (row.evidence_indices)
      evidenceIndices = JSON.parse(row.evidence_indices as string);
  } catch {
    evidenceIndices = [];
  }
  if (!Array.isArray(evidenceIndices)) evidenceIndices = [];
  evidenceIndices = evidenceIndices.filter(
    (i) => Number.isInteger(i) && i >= 0 && i < screenshots.length
  );
  return {
    id: row.id as string,
    streamId: row.stream_id as string,
    streamName: row.stream_name as string,
    detectedAt: row.detected_at as number,
    videoTimestamp: row.video_timestamp as number,
    videoTimestampLabel: row.video_timestamp_label as string,
    chunkPath: row.chunk_path as string,
    durationSeconds: row.duration_seconds as number,
    cashierDescription: row.cashier_description as string,
    customerDescription: row.customer_description as string,
    summary: row.summary as string,
    reasoning: row.reasoning as string,
    severity: row.severity as ViolationReport["severity"],
    confidence: row.confidence as number,
    screenshots,
    evidenceIndices,
  };
}

function rowToChat(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    role: row.role as "user" | "assistant",
    content: row.content as string,
    createdAt: row.created_at as number,
    reportRefs: row.report_refs ? JSON.parse(row.report_refs as string) : undefined,
    videoSessionId: (row.video_session_id as string | null) ?? null,
  };
}

// ----- Streams -----
export const streamsRepo = {
  list(): CameraStream[] {
    const rows = getDb().prepare("SELECT * FROM streams ORDER BY created_at DESC").all() as Record<
      string,
      unknown
    >[];
    return rows.map(rowToStream);
  },
  get(id: string): CameraStream | null {
    const row = getDb().prepare("SELECT * FROM streams WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToStream(row) : null;
  },
  insert(s: CameraStream): void {
    getDb()
      .prepare(
        `INSERT INTO streams (id, name, rtsp_url, status, created_at, last_active_at, error_message, source_type, source_config)
         VALUES (@id, @name, @rtspUrl, @status, @createdAt, @lastActiveAt, @errorMessage, @sourceType, @sourceConfigJson)`
      )
      .run({
        ...s,
        sourceConfigJson: s.sourceConfig ? JSON.stringify(s.sourceConfig) : null,
      });
  },
  updateStatus(id: string, status: CameraStream["status"], errorMessage?: string | null): void {
    getDb()
      .prepare(
        `UPDATE streams SET status = ?, last_active_at = ?, error_message = ? WHERE id = ?`
      )
      .run(status, Date.now(), errorMessage ?? null, id);
  },
  delete(id: string): void {
    getDb().prepare("DELETE FROM streams WHERE id = ?").run(id);
  },
};

// ----- Reports -----
export const reportsRepo = {
  list(limit = 100): ViolationReport[] {
    const rows = getDb()
      .prepare("SELECT * FROM reports ORDER BY detected_at DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToReport);
  },
  recent(limit = 20): ViolationReport[] {
    return this.list(limit);
  },
  get(id: string): ViolationReport | null {
    const row = getDb().prepare("SELECT * FROM reports WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToReport(row) : null;
  },
  insert(r: ViolationReport): void {
    getDb()
      .prepare(
        `INSERT INTO reports
          (id, stream_id, stream_name, detected_at, video_timestamp, video_timestamp_label,
           chunk_path, duration_seconds, cashier_description, customer_description, summary,
           reasoning, severity, confidence, screenshots, evidence_indices)
         VALUES (@id, @streamId, @streamName, @detectedAt, @videoTimestamp, @videoTimestampLabel,
           @chunkPath, @durationSeconds, @cashierDescription, @customerDescription, @summary,
           @reasoning, @severity, @confidence, @screenshotsJson, @evidenceIndicesJson)`
      )
      .run({
        ...r,
        screenshotsJson: JSON.stringify(r.screenshots),
        evidenceIndicesJson: JSON.stringify(r.evidenceIndices || []),
      });
  },
  count(): number {
    const row = getDb().prepare("SELECT COUNT(*) as c FROM reports").get() as { c: number };
    return row.c;
  },
  delete(id: string): boolean {
    const info = getDb().prepare("DELETE FROM reports WHERE id = ?").run(id);
    return info.changes > 0;
  },
};

// ----- Video sessions (on-demand user clips) -----
export const videoSessionRepo = {
  get(id: string): VideoSession | null {
    const row = getDb()
      .prepare("SELECT * FROM video_sessions WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    let framePaths: string[] = [];
    try {
      framePaths = JSON.parse((row.frame_paths as string) || "[]");
    } catch {
      framePaths = [];
    }
    return {
      id: row.id as string,
      name: row.name as string,
      framePaths,
      durationSeconds: (row.duration_seconds as number) || 0,
      createdAt: row.created_at as number,
    };
  },
  insert(s: VideoSession): void {
    getDb()
      .prepare(
        `INSERT INTO video_sessions (id, name, frame_paths, duration_seconds, created_at)
         VALUES (@id, @name, @framePathsJson, @durationSeconds, @createdAt)`
      )
      .run({
        ...s,
        framePathsJson: JSON.stringify(s.framePaths),
      });
  },
  delete(id: string): void {
    getDb().prepare("DELETE FROM video_sessions WHERE id = ?").run(id);
  },
};

// ----- Chat -----
export const chatRepo = {
  list(limit = 200): ChatMessage[] {
    const rows = getDb()
      .prepare("SELECT * FROM chat_messages ORDER BY created_at ASC LIMIT ?")
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToChat);
  },
  insert(m: ChatMessage): void {
    getDb()
      .prepare(
        `INSERT INTO chat_messages (id, role, content, created_at, report_refs, video_session_id)
         VALUES (@id, @role, @content, @createdAt, @reportRefsJson, @videoSessionId)`
      )
      .run({
        ...m,
        reportRefsJson: m.reportRefs ? JSON.stringify(m.reportRefs) : null,
        videoSessionId: m.videoSessionId ?? null,
      });
  },
  clear(): void {
    getDb().prepare("DELETE FROM chat_messages").run();
  },
};

// ----- Settings (key/value) -----
export const settingsRepo = {
  get(key: string): string | null {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  },
  set(key: string, value: string): void {
    getDb()
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, Date.now());
  },
  delete(key: string): void {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
  },
  all(): Record<string, string> {
    const rows = getDb().prepare("SELECT key, value FROM settings").all() as {
      key: string;
      value: string;
    }[];
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  },
};

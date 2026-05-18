import { spawn, ChildProcess, execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export interface RecordingHandle {
  process: ChildProcess;
  outputDir: string;
  segmentPattern: string;
}

/**
 * Best-effort RTSP connectivity probe with a hard timeout.
 * Returns null when OK; otherwise returns a short human-readable error string.
 */
export async function probeRtspUrl(
  rtspUrl: string,
  timeoutMs = 8000
): Promise<string | null> {
  return new Promise((resolve) => {
    const args = [
      "-v",
      "error",
      "-rtsp_transport",
      "tcp",
      // probe a tiny amount of data; we only need to validate connectivity/auth
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      rtspUrl,
    ];
    const proc = execFile(
      FFPROBE,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 256 * 1024 },
      (err, _stdout, stderr) => {
        if (!err) return resolve(null);
        const msg = (() => {
          if ((err as any)?.killed || (err as any)?.signal === "SIGTERM") {
            return `Timed out connecting to RTSP (${Math.round(
              timeoutMs / 1000
            )}s). Check port forwarding / firewall.`;
          }
          const s = String(stderr || (err as Error).message || "").trim();
          if (!s) return "RTSP probe failed (unknown error).";
          // Keep only the last couple of lines (most informative).
          const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
          return lines.slice(-3).join(" | ").slice(0, 240);
        })();
        resolve(msg);
      }
    );
    // Node's timeout sometimes doesn't kill the child on macOS in edge cases.
    const killTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs + 250);
    proc.once("exit", () => clearTimeout(killTimer));
  });
}

/**
 * Start recording an RTSP stream into segmented MP4 chunks.
 * ffmpeg will create files named chunk-000.mp4, chunk-001.mp4, ...
 * We use TCP transport for reliability.
 */
export function startRtspRecording({
  rtspUrl,
  outputDir,
  chunkSeconds,
}: {
  rtspUrl: string;
  outputDir: string;
  chunkSeconds: number;
}): RecordingHandle {
  const segmentPattern = path.join(outputDir, "chunk-%05d.mp4");
  const args = [
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    rtspUrl,
    "-c",
    "copy",
    "-f",
    "segment",
    "-segment_time",
    String(chunkSeconds),
    "-reset_timestamps",
    "1",
    "-strftime",
    "0",
    "-y",
    segmentPattern,
  ];
  const proc = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
  proc.stderr?.on("data", (data) => {
    // eslint-disable-next-line no-console
    console.error(`[ffmpeg ${path.basename(outputDir)}]`, data.toString().trim());
  });
  return { process: proc, outputDir, segmentPattern };
}

export function stopRecording(handle: RecordingHandle): Promise<void> {
  return new Promise((resolve) => {
    if (!handle.process || handle.process.killed) {
      resolve();
      return;
    }
    handle.process.once("exit", () => resolve());
    handle.process.kill("SIGTERM");
    setTimeout(() => {
      if (!handle.process.killed) handle.process.kill("SIGKILL");
      resolve();
    }, 4000);
  });
}

/** Probe video duration in seconds. */
export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await execFileP(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const v = parseFloat(stdout.trim());
  return Number.isFinite(v) ? v : 0;
}

/**
 * Extract N evenly spaced frames from a video file.
 * Returns the absolute file paths of the produced JPEGs (small, ~640px wide).
 */
export async function extractFrames({
  videoFile,
  outputDir,
  count,
  prefix,
  width = 1024,
  fullSpan = false,
}: {
  videoFile: string;
  outputDir: string;
  count: number;
  prefix: string;
  width?: number;
  /** If true, sample frames across 0-100% of the clip (better for short uploaded videos). */
  fullSpan?: boolean;
}): Promise<{ files: string[]; durationSeconds: number }> {
  await fs.mkdir(outputDir, { recursive: true });
  const duration = await probeDuration(videoFile);
  if (duration <= 0) return { files: [], durationSeconds: 0 };

  // Short videos use the entire span; longer videos trim the edges (they are often
  // half-encoded boundary frames produced by ffmpeg segment muxer).
  const useFullSpan = fullSpan || duration <= 30;
  // Always keep a tiny margin off the very end — ffmpeg returns nothing
  // when `-ss` lands at or past the last frame.
  const EDGE = Math.min(0.5, Math.max(0.05, duration * 0.02));
  const start = useFullSpan ? 0 : duration * 0.05;
  const end = useFullSpan ? Math.max(0, duration - EDGE) : duration * 0.95;
  const span = Math.max(0, end - start);
  const timestamps = Array.from({ length: count }, (_, i) =>
    count === 1 ? duration / 2 : start + (span * i) / (count - 1)
  );

  const files: string[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const out = path.join(outputDir, `${prefix}-${String(i).padStart(2, "0")}.jpg`);
    try {
      await execFileP(FFMPEG, [
        "-loglevel",
        "error",
        "-ss",
        ts.toFixed(2),
        "-i",
        videoFile,
        "-frames:v",
        "1",
        "-vf",
        `scale=${width}:-2`,
        "-q:v",
        "5",
        "-y",
        out,
      ]);
    } catch {
      // ffmpeg failed for this frame; skip it.
      continue;
    }
    try {
      const stat = await fs.stat(out);
      if (stat.size > 0) files.push(out);
    } catch {
      // File not produced; skip silently.
    }
  }
  return { files, durationSeconds: duration };
}

/**
 * Quick motion / activity gate: count scene changes above a threshold.
 * Returns true if there is meaningful motion in the chunk (suggesting a possible transaction).
 * This is the cheap first stage of the two-stage pipeline.
 */
export async function detectMotion(videoFile: string, threshold = 0.08): Promise<boolean> {
  try {
    const { stderr } = await execFileP(FFMPEG, [
      "-loglevel",
      "info",
      "-i",
      videoFile,
      "-vf",
      `select='gt(scene,${threshold})',showinfo`,
      "-f",
      "null",
      "-",
    ]);
    const matches = stderr.match(/pts_time:/g);
    return (matches?.length ?? 0) >= 2;
  } catch {
    return true; // If detection fails, fall back to analyzing.
  }
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await execFileP(FFMPEG, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/** Read the creation_time metadata tag from an MP4/MOV. Returns null if missing. */
export async function probeCreationTime(file: string): Promise<Date | null> {
  try {
    const { stdout } = await execFileP(FFPROBE, [
      "-v",
      "error",
      "-show_entries",
      "format_tags=creation_time",
      "-of",
      "default=nw=1:nk=1",
      file,
    ]);
    const raw = stdout.trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Parse common CCTV / export filename timestamp patterns.
 * Handles at least:
 *   20260419145722660.mp4           (HiLook/Hikvision, 14 digits + ms)
 *   2026-04-19_14-57-22.mp4
 *   2026-04-19T14-57-22.mkv
 *   VID_20260419_145722.mp4
 */
export function parseFilenameTimestamp(filename: string): Date | null {
  // Find any 14+ consecutive digits
  const match = filename.match(/(\d{14})(\d{0,3})?/);
  if (match) {
    const base = match[1];
    const Y = parseInt(base.slice(0, 4), 10);
    const M = parseInt(base.slice(4, 6), 10);
    const D = parseInt(base.slice(6, 8), 10);
    const h = parseInt(base.slice(8, 10), 10);
    const m = parseInt(base.slice(10, 12), 10);
    const s = parseInt(base.slice(12, 14), 10);
    if (validDate(Y, M, D, h, m, s)) {
      const ms = match[2] ? parseInt(match[2].padEnd(3, "0").slice(0, 3), 10) : 0;
      return new Date(Y, M - 1, D, h, m, s, ms);
    }
  }
  // YYYY-MM-DD[ T_-]HH-MM-SS or similar
  const dashed = filename.match(
    /(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})[-_T ]?(\d{2})[-_:.]?(\d{2})[-_:.]?(\d{2})/
  );
  if (dashed) {
    const [, Y, M, D, h, m, s] = dashed.map((x) => parseInt(x, 10));
    if (validDate(Y, M, D, h, m, s)) return new Date(Y, M - 1, D, h, m, s);
  }
  return null;
}

function validDate(Y: number, M: number, D: number, h: number, m: number, s: number) {
  if (Y < 2000 || Y > 2100) return false;
  if (M < 1 || M > 12) return false;
  if (D < 1 || D > 31) return false;
  if (h > 23 || m > 59 || s > 59) return false;
  return true;
}

/**
 * Best-effort detection of when a video was actually recorded:
 * 1) Parse filename (covers most CCTV exports).
 * 2) MP4 `creation_time` metadata.
 * 3) File mtime.
 * 4) Fallback: now.
 */
export async function detectVideoStartTime(file: string): Promise<{
  date: Date;
  source: "filename" | "metadata" | "mtime" | "fallback";
}> {
  const name = path.basename(file);
  const byName = parseFilenameTimestamp(name);
  if (byName) return { date: byName, source: "filename" };

  const byTag = await probeCreationTime(file);
  if (byTag) return { date: byTag, source: "metadata" };

  try {
    const st = await fs.stat(file);
    return { date: st.mtime, source: "mtime" };
  } catch {
    return { date: new Date(), source: "fallback" };
  }
}

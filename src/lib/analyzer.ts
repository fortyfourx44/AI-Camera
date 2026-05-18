import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import crypto from "node:crypto";

import {
  RecordingHandle,
  detectMotion,
  detectVideoStartTime,
  extractFrames,
  probeRtspUrl,
  startRtspRecording,
  stopRecording,
} from "./ffmpeg";
import { analyzeChunk } from "./claude";
import { reportsRepo, streamsRepo } from "./db";
import { RECORDINGS_DIR, SCREENSHOTS_DIR, ensureDirs } from "./paths";
import type { ViolationReport, AnalysisResult } from "./types";
import { formatTimestamp } from "./utils";
import { getAppSettings, DEFAULT_CHUNK_SECONDS } from "./prompts";
import { assertLiveMonitoringAllowed } from "./serverless-guard";

const CHUNK_SECONDS = DEFAULT_CHUNK_SECONDS;

interface ActiveStream {
  streamId: string;
  rtspUrl: string;
  name: string;
  handle: RecordingHandle;
  recordingDir: string;
  startedAt: number;
  processedFiles: Set<string>;
  pollTimer: NodeJS.Timeout;
  startupTimer: NodeJS.Timeout;
}

const activeStreams = new Map<string, ActiveStream>();

/** Auto-stop timers for both RTSP and Hik-Connect snapshot streams. */
const autoStopTimers = new Map<string, NodeJS.Timeout>();

function scheduleAutoStop(streamId: string, autoStopAfterMs?: number | null) {
  const existing = autoStopTimers.get(streamId);
  if (existing) clearTimeout(existing);
  autoStopTimers.delete(streamId);
  if (typeof autoStopAfterMs === "number" && autoStopAfterMs > 0) {
    const t = setTimeout(() => {
      autoStopTimers.delete(streamId);
      stopStreamAnalysis(streamId).catch(() => {});
    }, autoStopAfterMs);
    autoStopTimers.set(streamId, t);
  }
}

export interface StartAnalysisOptions {
  /**
   * Stop analysis automatically after this many milliseconds (wall clock).
   * Omit, null, or ≤0 = run until the user stops.
   */
  autoStopAfterMs?: number | null;
}

export function isStreamActive(streamId: string): boolean {
  return activeStreams.has(streamId);
}

export function getActiveStreamIds(): string[] {
  return Array.from(activeStreams.keys());
}

export async function startStreamAnalysis(
  streamId: string,
  opts?: StartAnalysisOptions
): Promise<void> {
  ensureDirs();

  const stream = streamsRepo.get(streamId);
  if (!stream) throw new Error(`Stream ${streamId} not found.`);

  assertLiveMonitoringAllowed(stream);

  // Cloud cameras don't have a real RTSP URL — we fan out to a separate
  // module that polls JPEG snapshots from the Hik-Connect cloud on a
  // per-camera interval and assembles virtual chunks for the same
  // `processChunk` pipeline used by RTSP streams.
  if (stream.sourceType === "hikconnect") {
    const { startSnapshotPolling, isSnapshotStreamActive } = await import(
      "./snapshot-poller"
    );
    if (isSnapshotStreamActive(streamId)) return;
    await startSnapshotPolling(stream);
    scheduleAutoStop(streamId, opts?.autoStopAfterMs);
    return;
  }

  if (activeStreams.has(streamId)) return;

  const recordingDir = path.join(RECORDINGS_DIR, streamId);
  await fs.mkdir(recordingDir, { recursive: true });

  // Fail fast with a clear reason when the RTSP endpoint is unreachable.
  const probeErr = await probeRtspUrl(stream.rtspUrl, 8000);
  if (probeErr) {
    streamsRepo.updateStatus(streamId, "error", probeErr);
    throw new Error(probeErr);
  }

  const handle = startRtspRecording({
    rtspUrl: stream.rtspUrl,
    outputDir: recordingDir,
    chunkSeconds: CHUNK_SECONDS,
  });

  const processedFiles = new Set<string>();
  const startedAt = Date.now();

  const active: ActiveStream = {
    streamId,
    rtspUrl: stream.rtspUrl,
    name: stream.name,
    handle,
    recordingDir,
    startedAt,
    processedFiles,
    pollTimer: setTimeout(() => {}, 0),
    startupTimer: setTimeout(() => {}, 0),
  };

  // Whenever ffmpeg crashes, mark stream errored.
  handle.process.once("exit", (code) => {
    if (activeStreams.has(streamId)) {
      streamsRepo.updateStatus(
        streamId,
        "error",
        `ffmpeg exited with code ${code}. Check the RTSP URL is reachable. (Tip: many portals show an HTTP port like :80 — RTSP is usually :554 or another forwarded RTSP port.)`
      );
      stopStreamAnalysis(streamId).catch(() => {});
    }
  });

  // Startup watchdog: if no chunks are created shortly after start, fail fast.
  active.startupTimer = setTimeout(async () => {
    try {
      const entries = await fs.readdir(active.recordingDir).catch(() => []);
      const hasAnyChunk = entries.some(
        (f) => f.startsWith("chunk-") && f.endsWith(".mp4")
      );
      if (!hasAnyChunk && activeStreams.has(streamId)) {
        streamsRepo.updateStatus(
          streamId,
          "error",
          "No video received from RTSP stream (no chunks created). Check the RTSP host/port/credentials. (Tip: many portals show an HTTP port like :80 — RTSP is usually :554 or another forwarded RTSP port.)"
        );
        await stopStreamAnalysis(streamId);
      }
    } catch {
      // ignore
    }
  }, 10_000);

  active.pollTimer = setInterval(() => {
    pollAndProcess(active).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[analyzer ${streamId}]`, err);
    });
  }, 5000);

  activeStreams.set(streamId, active);
  streamsRepo.updateStatus(streamId, "recording", null);
  scheduleAutoStop(streamId, opts?.autoStopAfterMs);
}

export async function stopStreamAnalysis(streamId: string): Promise<void> {
  const pendingStop = autoStopTimers.get(streamId);
  if (pendingStop) clearTimeout(pendingStop);
  autoStopTimers.delete(streamId);

  // Hik-Connect poller is a separate registry. Try both unconditionally so
  // callers don't need to care about source type.
  try {
    const { stopSnapshotPolling } = await import("./snapshot-poller");
    await stopSnapshotPolling(streamId);
  } catch {
    // snapshot-poller may not be loaded yet; ignore.
  }
  const active = activeStreams.get(streamId);
  if (active) {
    clearInterval(active.pollTimer);
    clearTimeout(active.startupTimer);
    await stopRecording(active.handle);
    activeStreams.delete(streamId);
  }
  // Always reset DB status — even if neither registry had the stream in
  // memory (server restart / HMR), we want to clear any stale "recording"
  // state so the UI matches reality.
  streamsRepo.updateStatus(streamId, "idle", null);
}

async function pollAndProcess(active: ActiveStream): Promise<void> {
  const entries = await fs.readdir(active.recordingDir);
  const chunks = entries
    .filter((f) => f.startsWith("chunk-") && f.endsWith(".mp4"))
    .sort();

  // The newest file might still be being written by ffmpeg, so skip it.
  const completed = chunks.slice(0, -1);

  for (const filename of completed) {
    if (active.processedFiles.has(filename)) continue;
    active.processedFiles.add(filename);
    const fullPath = path.join(active.recordingDir, filename);
    try {
      await processChunk({
        streamId: active.streamId,
        streamName: active.name,
        chunkPath: fullPath,
        chunkFilename: filename,
        recordingStartedAt: active.startedAt,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[analyzer] Failed to process ${filename}:`, err);
    }
  }
}

interface ProcessChunkArgs {
  streamId: string;
  streamName: string;
  chunkPath: string;
  chunkFilename: string;
  recordingStartedAt: number;
  /** When true, skip the motion-detection gate and always call the LLM. */
  skipMotionGate?: boolean;
  /** Overrides FRAMES_PER_CHUNK setting for this chunk. */
  frameCountOverride?: number;
  /** When true, extract frames across 0-100% span (for short uploaded clips). */
  fullSpanFrames?: boolean;
  /**
   * When provided, skip the ffmpeg motion gate AND the frame-extraction step
   * entirely — we already have the frames on disk (e.g. from the snapshot
   * poller). `chunkPath` is then only used for the report metadata (duration,
   * label) and doesn't need to be an actual video file.
   */
  preExtractedFrames?: {
    files: string[];
    durationSeconds: number;
    /** Unix ms of the first frame in this chunk. Overrides the chunkIndex-derived value. */
    startedAtMs?: number;
  };
}

export interface ChunkOutcome {
  chunkFilename: string;
  result: AnalysisResult;
  reportId?: string;
  screenshotsRelative: string[];
  videoTimestampLabel: string;
}

export async function processChunk(args: ProcessChunkArgs): Promise<ChunkOutcome> {
  const {
    streamId,
    streamName,
    chunkPath,
    chunkFilename,
    recordingStartedAt,
    skipMotionGate,
    frameCountOverride,
    fullSpanFrames,
    preExtractedFrames,
  } = args;
  const usePreExtracted = !!preExtractedFrames;
  if (!usePreExtracted && !existsSync(chunkPath)) {
    throw new Error(`Chunk not found: ${chunkPath}`);
  }

  const settings = getAppSettings();
  const frameCount = frameCountOverride ?? settings.framesPerChunk;
  const chunkIndex = parseInt(chunkFilename.replace(/[^0-9]/g, ""), 10) || 0;
  const videoTimestampSec = chunkIndex * CHUNK_SECONDS;
  const videoTimestampLabel = formatTimestamp(videoTimestampSec);

  // Stage 1: cheap motion gate. Skipped when:
  //   - caller asked us to (skipMotionGate)
  //   - caller provided their own pre-extracted frames (they ran their own gate)
  const hasMotion =
    skipMotionGate || usePreExtracted
      ? true
      : await detectMotion(chunkPath, settings.motionThreshold);
  if (!hasMotion) {
    return {
      chunkFilename,
      videoTimestampLabel,
      screenshotsRelative: [],
      result: {
        hasTransaction: false,
        receiptHandedToCustomer: null,
        confidence: 1,
        cashierDescription: "",
        customerDescription: "",
        summary: "No significant motion detected — skipped LLM.",
        reasoning: "Motion gate filtered this chunk.",
        bestEvidenceFrameIndex: null,
        evidenceFrameIndices: [],
        severity: "low",
        violatedRules: [],
      },
    };
  }

  // Stage 2: obtain frames — either extract from video, or use what the
  // caller handed us (snapshot poller path).
  const screenshotsDir = path.join(SCREENSHOTS_DIR, streamId);
  const prefix = chunkFilename.replace(/\.mp4$/, "");
  const { files, durationSeconds } = usePreExtracted
    ? {
        files: preExtractedFrames!.files,
        durationSeconds: preExtractedFrames!.durationSeconds,
      }
    : await extractFrames({
        videoFile: chunkPath,
        outputDir: screenshotsDir,
        count: frameCount,
        prefix,
        fullSpan: fullSpanFrames,
      });
  const screenshotsRelative = files.map((f) => path.relative(process.cwd(), f));

  if (files.length === 0) {
    return {
      chunkFilename,
      videoTimestampLabel,
      screenshotsRelative,
      result: {
        hasTransaction: false,
        receiptHandedToCustomer: null,
        confidence: 0,
        cashierDescription: "",
        customerDescription: "",
        summary: "Could not extract frames.",
        reasoning: "ffmpeg returned no frames.",
        bestEvidenceFrameIndex: null,
        evidenceFrameIndices: [],
        severity: "low",
        violatedRules: [],
      },
    };
  }

  const chunkStartTime = new Date(
    preExtractedFrames?.startedAtMs ??
      recordingStartedAt + videoTimestampSec * 1000
  );
  const result = await analyzeChunk({
    framePaths: files,
    chunkLabel: chunkFilename,
    chunkStartTime,
    chunkDurationSeconds: durationSeconds,
  });

  const isViolation =
    result.hasTransaction === true && result.receiptHandedToCustomer === false;

  if (!isViolation) {
    return { chunkFilename, videoTimestampLabel, screenshotsRelative, result };
  }

  // Build the report. Screenshots are kept as evidence.
  // detectedAt = midpoint of the chunk in wall-clock time (best single-point estimate).
  const detectedAt =
    (preExtractedFrames?.startedAtMs ??
      recordingStartedAt + videoTimestampSec * 1000) +
    (durationSeconds / 2) * 1000;

  // Valid evidence indices only (must exist in the extracted screenshots).
  const evidenceIndices = (result.evidenceFrameIndices || []).filter(
    (i) => i >= 0 && i < screenshotsRelative.length
  );

  const report: ViolationReport = {
    id: crypto.randomUUID(),
    streamId,
    streamName,
    detectedAt,
    videoTimestamp: videoTimestampSec,
    videoTimestampLabel,
    chunkPath,
    durationSeconds,
    cashierDescription: result.cashierDescription,
    customerDescription: result.customerDescription,
    summary: result.summary,
    reasoning: result.reasoning,
    severity: result.severity,
    confidence: result.confidence,
    screenshots: screenshotsRelative,
    evidenceIndices,
  };

  reportsRepo.insert(report);
  return {
    chunkFilename,
    videoTimestampLabel,
    screenshotsRelative,
    result,
    reportId: report.id,
  };
}

export interface UploadAnalysisSummary {
  chunksProcessed: number;
  violations: number;
  totalSeconds: number;
  videoStartTime: string;
  videoStartTimeSource: "filename" | "metadata" | "mtime" | "fallback" | "user";
  outcomes: Array<{
    chunkIndex: number;
    videoTimestampLabel: string;
    hasTransaction: boolean;
    receiptHandedToCustomer: boolean | null;
    summary: string;
    reasoning: string;
    severity: "low" | "medium" | "high";
    confidence: number;
    reportId?: string;
    /** Relative screenshot paths (for /api/screenshots). */
    screenshots: string[];
    /** Indices within `screenshots` that Claude called out as evidence. */
    evidenceIndices: number[];
  }>;
  reports: string[];
}

/**
 * Stand-alone analysis for a single uploaded video file (not from RTSP).
 * Splits the file into N-second chunks first, then runs the same pipeline.
 * Uploads are NOT registered as a camera stream — they're analyzed in-place.
 */
export async function analyzeUploadedFile({
  filePath,
  streamName,
  videoStartTime,
  originalFilename,
}: {
  filePath: string;
  streamName: string;
  /** When the video was actually recorded. If omitted, auto-detected from filename / metadata / mtime. */
  videoStartTime?: Date;
  /** Original upload filename (used for filename-based timestamp detection). */
  originalFilename?: string;
}): Promise<UploadAnalysisSummary> {
  ensureDirs();
  const virtualId = `upload-${crypto.randomUUID()}`;
  const recordingDir = path.join(RECORDINGS_DIR, virtualId);
  await fs.mkdir(recordingDir, { recursive: true });

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileP = promisify(execFile);
  const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

  // Robust segmentation: re-encode to ensure keyframes at segment boundaries.
  // Cheap preset; audio dropped (we don't need it).
  try {
    await execFileP(FFMPEG, [
      "-loglevel",
      "error",
      "-i",
      filePath,
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      String(CHUNK_SECONDS * 25),
      "-force_key_frames",
      `expr:gte(t,n_forced*${CHUNK_SECONDS})`,
      "-f",
      "segment",
      "-segment_time",
      String(CHUNK_SECONDS),
      "-reset_timestamps",
      "1",
      "-y",
      path.join(recordingDir, "chunk-%05d.mp4"),
    ]);
  } catch (err) {
    // Fallback: no segmentation (treat whole file as one chunk).
    // eslint-disable-next-line no-console
    console.error("[analyzer] Segmentation failed, falling back to single chunk:", err);
    await fs.copyFile(filePath, path.join(recordingDir, "chunk-00000.mp4"));
  }

  // Figure out when the video was actually recorded.
  let videoStart: Date;
  let source: UploadAnalysisSummary["videoStartTimeSource"];
  if (videoStartTime && Number.isFinite(videoStartTime.getTime())) {
    videoStart = videoStartTime;
    source = "user";
  } else {
    // Prefer parsing the original filename first (it often survives cleanly even
    // after we save it under a UUID on disk).
    let detected: Awaited<ReturnType<typeof detectVideoStartTime>> | null = null;
    if (originalFilename) {
      const { parseFilenameTimestamp } = await import("./ffmpeg");
      const byName = parseFilenameTimestamp(originalFilename);
      if (byName) detected = { date: byName, source: "filename" };
    }
    if (!detected) detected = await detectVideoStartTime(filePath);
    videoStart = detected.date;
    source = detected.source;
  }
  const recordingStartedAt = videoStart.getTime();

  const entries = (await fs.readdir(recordingDir))
    .filter((f) => f.startsWith("chunk-") && f.endsWith(".mp4"))
    .sort();

  const reportIds: string[] = [];
  const outcomes: UploadAnalysisSummary["outcomes"] = [];
  let totalSeconds = 0;

  // For uploads we bypass the motion gate and push frames high (the user
  // explicitly asked for this footage to be analyzed). A dense sample matters
  // most for short clips where a single missed frame can hide the moment
  // a receipt is (or isn't) handed over.
  const settings = getAppSettings();
  const frameCount = Math.max(settings.framesPerChunk, 16);

  for (const filename of entries) {
    const chunkPath = path.join(recordingDir, filename);
    const outcome = await processChunk({
      streamId: virtualId,
      streamName,
      chunkPath,
      chunkFilename: filename,
      recordingStartedAt,
      skipMotionGate: true,
      frameCountOverride: frameCount,
      fullSpanFrames: true,
    });
    // Print a compact verdict line per chunk so the user can see at a glance in
    // the dev log what Claude decided for each chunk of an uploaded video.
    const r = outcome.result;
    // eslint-disable-next-line no-console
    console.log(
      `[upload ${virtualId} ${filename}] hasActivity=${r.hasTransaction} compliant=${r.receiptHandedToCustomer} violated=[${(r.violatedRules ?? []).join(",")}] conf=${r.confidence.toFixed(2)} summary="${r.summary.replace(/\s+/g, " ").slice(0, 140)}"`
    );
    if (outcome.reportId) reportIds.push(outcome.reportId);
    const idx = parseInt(filename.replace(/[^0-9]/g, ""), 10) || 0;
    outcomes.push({
      chunkIndex: idx,
      videoTimestampLabel: outcome.videoTimestampLabel,
      hasTransaction: outcome.result.hasTransaction,
      receiptHandedToCustomer: outcome.result.receiptHandedToCustomer,
      summary: outcome.result.summary,
      reasoning: outcome.result.reasoning,
      severity: outcome.result.severity,
      confidence: outcome.result.confidence,
      reportId: outcome.reportId,
      screenshots: outcome.screenshotsRelative,
      evidenceIndices: (outcome.result.evidenceFrameIndices || []).filter(
        (i) => i >= 0 && i < outcome.screenshotsRelative.length
      ),
    });
    totalSeconds += CHUNK_SECONDS;
  }

  return {
    chunksProcessed: entries.length,
    violations: reportIds.length,
    totalSeconds,
    videoStartTime: videoStart.toISOString(),
    videoStartTimeSource: source,
    outcomes,
    reports: reportIds,
  };
}

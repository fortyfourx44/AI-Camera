import fs from "node:fs/promises";
import path from "node:path";

import { processChunk } from "./analyzer";
import { streamsRepo } from "./db";
import { chunkHasMovement, IDENTICAL_PSNR_DB } from "./frame-diff";
import { fetchSnapshotToFile } from "./hikconnect-snapshot";
import { getActiveHikConnectSession } from "./hikconnect-session";
import { RECORDINGS_DIR, SCREENSHOTS_DIR, ensureDirs } from "./paths";
import type { CameraStream, HikConnectSourceConfig } from "./types";

/**
 * Per-stream snapshot poller. One `setInterval` per active cloud camera.
 * When the accumulator has enough frames for a chunk, we run a cheap PSNR
 * motion gate across the frames; if there's movement we submit to the
 * analyzer's `processChunk` with `preExtractedFrames` (no ffmpeg extraction
 * needed — the frames are already JPEGs on disk). Otherwise we skip the
 * Claude call and log the idle chunk.
 */

interface SnapshotStream {
  streamId: string;
  deviceSerial: string;
  channelNo: number;
  pollIntervalMs: number;
  framesPerChunk: number;
  recordingDir: string;
  screenshotsDir: string;
  name: string;
  startedAt: number;
  /** Wall-clock ms when the current chunk's first frame was captured. */
  chunkStartedAtMs: number | null;
  pending: string[];
  chunkIndex: number;
  consecutiveFailures: number;
  pollTimer: NodeJS.Timeout;
  tickInFlight: boolean;
}

const active = new Map<string, SnapshotStream>();

export function isSnapshotStreamActive(streamId: string): boolean {
  return active.has(streamId);
}

export function getActiveSnapshotStreamIds(): string[] {
  return Array.from(active.keys());
}

export async function startSnapshotPolling(
  stream: CameraStream
): Promise<void> {
  if (active.has(stream.id)) return;
  if (stream.sourceType !== "hikconnect" || !stream.sourceConfig) {
    throw new Error(
      `Stream ${stream.id} has no hikconnect sourceConfig; cannot poll snapshots.`
    );
  }
  ensureDirs();

  const cfg = stream.sourceConfig as HikConnectSourceConfig;
  const pollIntervalMs = Math.max(5, Math.min(300, cfg.pollIntervalSec)) * 1000;
  const framesPerChunk = Math.max(2, Math.min(24, cfg.framesPerChunk));

  const recordingDir = path.join(RECORDINGS_DIR, stream.id);
  const screenshotsDir = path.join(SCREENSHOTS_DIR, stream.id);
  await fs.mkdir(recordingDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });

  const state: SnapshotStream = {
    streamId: stream.id,
    deviceSerial: cfg.deviceSerial,
    channelNo: cfg.channelNo,
    pollIntervalMs,
    framesPerChunk,
    recordingDir,
    screenshotsDir,
    name: stream.name,
    startedAt: Date.now(),
    chunkStartedAtMs: null,
    pending: [],
    chunkIndex: 0,
    consecutiveFailures: 0,
    pollTimer: setTimeout(() => {}, 0),
    tickInFlight: false,
  };

  // Fire the first tick immediately so the user sees a JPEG on disk within
  // seconds rather than waiting a full interval.
  state.pollTimer = setInterval(() => {
    if (state.tickInFlight) return;
    state.tickInFlight = true;
    tick(state)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[snapshot-poller ${state.streamId}]`, err);
      })
      .finally(() => {
        state.tickInFlight = false;
      });
  }, state.pollIntervalMs);
  active.set(stream.id, state);
  streamsRepo.updateStatus(stream.id, "recording", null);

  // eslint-disable-next-line no-console
  console.log(
    `[snapshot-poller ${stream.id}] started name="${stream.name}" serial=${state.deviceSerial} ch=${state.channelNo} pollMs=${state.pollIntervalMs} fpc=${state.framesPerChunk}`
  );

  // Kick off an immediate tick outside the interval so the first frame
  // arrives quickly.
  state.tickInFlight = true;
  tick(state)
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[snapshot-poller ${state.streamId}] initial tick`, err);
    })
    .finally(() => {
      state.tickInFlight = false;
    });
}

export async function stopSnapshotPolling(streamId: string): Promise<void> {
  const state = active.get(streamId);
  if (state) {
    clearInterval(state.pollTimer);
    active.delete(streamId);
  }
  // Always reset DB status, even when we had no in-memory state. After an HMR
  // reload or a server restart the poller map is empty but the DB may still
  // say "recording" — we want the Stop button to always bring the UI back to
  // idle rather than silently no-op.
  streamsRepo.updateStatus(streamId, "idle", null);
  // eslint-disable-next-line no-console
  console.log(
    `[snapshot-poller ${streamId}] stopped (hadInMemoryState=${!!state})`
  );
}

async function tick(state: SnapshotStream): Promise<void> {
  const frameIdx = state.pending.length;
  const frameName = `snap-${String(state.chunkIndex).padStart(5, "0")}-${String(
    frameIdx
  ).padStart(2, "0")}.jpg`;
  const filePath = path.join(state.screenshotsDir, frameName);

  let capturedAt: number;
  try {
    const session = await getActiveHikConnectSession();
    capturedAt = Date.now();
    await fetchSnapshotToFile(
      session,
      state.deviceSerial,
      state.channelNo,
      filePath
    );
    state.consecutiveFailures = 0;
  } catch (err) {
    state.consecutiveFailures += 1;
    // eslint-disable-next-line no-console
    console.error(
      `[snapshot-poller ${state.streamId}] capture failed (#${state.consecutiveFailures}): ${err instanceof Error ? err.message : String(err)}`
    );
    // If snapshots are entirely unsupported for this camera/account, retrying
    // for minutes just burns calls and confuses the UI. Fail fast after a
    // couple of attempts so the user sees a clear error.
    if (state.consecutiveFailures >= 2) {
      streamsRepo.updateStatus(
        state.streamId,
        "error",
        `Hik-Connect snapshot failed ${state.consecutiveFailures} times. This account/device may not allow cloud snapshots for this camera. Last error: ${err instanceof Error ? err.message : String(err)}`
      );
      await stopSnapshotPolling(state.streamId);
    }
    return;
  }

  if (state.pending.length === 0) state.chunkStartedAtMs = capturedAt;
  state.pending.push(filePath);

  if (state.pending.length < state.framesPerChunk) return;

  // We have a full chunk. Assemble its metadata, run motion gate, then
  // either submit to Claude or skip.
  const chunkFrames = state.pending;
  const chunkStartedAtMs = state.chunkStartedAtMs ?? capturedAt;
  const durationSeconds =
    ((state.framesPerChunk - 1) * state.pollIntervalMs) / 1000;
  const chunkIndex = state.chunkIndex;
  state.chunkIndex += 1;
  state.pending = [];
  state.chunkStartedAtMs = null;

  let moved = true;
  let psnrInfo = "";
  try {
    const result = await chunkHasMovement(chunkFrames, IDENTICAL_PSNR_DB);
    moved = result.moved;
    psnrInfo = `psnrMin=${result.minPsnr.toFixed(1)} psnrMax=${result.maxPsnr.toFixed(1)}`;
  } catch (err) {
    // If the gate itself fails, default to "analyze it" so we don't silently
    // miss violations just because PSNR crashed.
    // eslint-disable-next-line no-console
    console.error(
      `[snapshot-poller ${state.streamId}] motion gate failed, analyzing anyway:`,
      err
    );
  }

  if (!moved) {
    // eslint-disable-next-line no-console
    console.log(
      `[snapshot-poller ${state.streamId}] chunk ${chunkIndex} skipped (idle, ${psnrInfo})`
    );
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `[snapshot-poller ${state.streamId}] chunk ${chunkIndex} analyzing (${psnrInfo}, frames=${chunkFrames.length})`
  );

  try {
    await processChunk({
      streamId: state.streamId,
      streamName: state.name,
      // chunkPath is not read when preExtractedFrames is set, but keep it
      // pointing somewhere meaningful for logs / report metadata.
      chunkPath: path.join(
        state.recordingDir,
        `snap-${String(chunkIndex).padStart(5, "0")}.virtual`
      ),
      chunkFilename: `chunk-${String(chunkIndex).padStart(5, "0")}`,
      recordingStartedAt: state.startedAt,
      preExtractedFrames: {
        files: chunkFrames,
        durationSeconds,
        startedAtMs: chunkStartedAtMs,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[snapshot-poller ${state.streamId}] processChunk ${chunkIndex} failed:`,
      err
    );
  }
}

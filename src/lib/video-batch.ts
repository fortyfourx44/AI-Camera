import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { settingsRepo, videoBatchRepo } from "./db";
import {
  SCREENSHOTS_DIR,
  ensureDirs,
  resolveScreenshotPath,
  toStoredScreenshotPath,
} from "./paths";
import { K_ACTIVE_VIDEO_BATCH } from "./prompts";
import type { BatchVideoClip, FlatFrameRef, VideoBatch } from "./types";
import { formatDuration, formatOffset } from "./video-format";

export { formatDuration, formatOffset, batchSummaryLabel } from "./video-format";
import {
  MAX_FRAMES_PER_ANALYSIS,
  MAX_VIDEOS_PER_BATCH,
} from "./video-batch-constants";

export function getActiveVideoBatchId(): string | null {
  return settingsRepo.get(K_ACTIVE_VIDEO_BATCH);
}

export function setActiveVideoBatchId(id: string | null): void {
  if (id) settingsRepo.set(K_ACTIVE_VIDEO_BATCH, id);
  else settingsRepo.delete(K_ACTIVE_VIDEO_BATCH);
}

export function getActiveVideoBatch(): VideoBatch | null {
  const id = getActiveVideoBatchId();
  if (!id) return null;
  return videoBatchRepo.get(id);
}

export async function getOrCreateActiveBatch(): Promise<VideoBatch> {
  let batch = getActiveVideoBatch();
  if (batch) return batch;
  batch = {
    id: crypto.randomUUID(),
    videos: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  videoBatchRepo.insert(batch);
  setActiveVideoBatchId(batch.id);
  return batch;
}

export async function addClipToBatch({
  name,
  frames,
  durationSeconds,
  frameTimestamps,
}: {
  name: string;
  frames: { buffer: Buffer; ext?: string }[];
  durationSeconds: number;
  frameTimestamps: string[];
}): Promise<VideoBatch> {
  const batch = await getOrCreateActiveBatch();
  if (batch.videos.length >= MAX_VIDEOS_PER_BATCH) {
    throw new Error(`Maximum ${MAX_VIDEOS_PER_BATCH} videos per batch.`);
  }

  ensureDirs();
  const clipId = crypto.randomUUID();
  const clipDir = path.join(SCREENSHOTS_DIR, "batches", batch.id, clipId);
  await fs.mkdir(clipDir, { recursive: true });

  const framePaths: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const ext = frames[i].ext === ".png" ? ".png" : ".jpg";
    const filename = `frame-${String(i).padStart(3, "0")}${ext}`;
    const abs = path.join(clipDir, filename);
    await fs.writeFile(abs, frames[i].buffer);
    framePaths.push(toStoredScreenshotPath(abs));
  }

  const clip: BatchVideoClip = {
    id: clipId,
    name,
    durationSeconds: Math.max(0, durationSeconds),
    framePaths,
    frameTimestamps:
      frameTimestamps.length === framePaths.length
        ? frameTimestamps
        : framePaths.map((_, i) => formatOffset(durationSeconds, i, framePaths.length)),
    sortOrder: batch.videos.length,
    addedAt: Date.now(),
  };

  const updated: VideoBatch = {
    ...batch,
    videos: [...batch.videos, clip],
    updatedAt: Date.now(),
  };
  videoBatchRepo.update(updated);
  return updated;
}

export function clearActiveBatch(): void {
  const id = getActiveVideoBatchId();
  if (id) videoBatchRepo.delete(id);
  setActiveVideoBatchId(null);
}

/** Build flat frame list for vision + UI (respects MAX_FRAMES_PER_ANALYSIS). */
export function buildFlatFrameManifest(batch: VideoBatch): FlatFrameRef[] {
  const n = batch.videos.length;
  if (n === 0) return [];

  const perVideo = Math.max(2, Math.min(8, Math.floor(MAX_FRAMES_PER_ANALYSIS / n)));
  const out: FlatFrameRef[] = [];
  let flat = 0;

  for (let vi = 0; vi < n; vi++) {
    const v = batch.videos[vi];
    const take = Math.min(perVideo, v.framePaths.length);
    const step = Math.max(1, Math.floor(v.framePaths.length / take));
    for (let fi = 0, taken = 0; fi < v.framePaths.length && taken < take; fi += step, taken++) {
      out.push({
        flatIndex: flat++,
        videoIndex: vi,
        videoName: v.name,
        frameIndex: fi,
        path: v.framePaths[fi],
        timestampLabel: v.frameTimestamps[fi] || formatOffset(v.durationSeconds, fi, v.framePaths.length),
      });
    }
  }
  return out.slice(0, MAX_FRAMES_PER_ANALYSIS);
}

export function flatFrameAbsPaths(manifest: FlatFrameRef[]): string[] {
  return manifest.map((f) => {
    const abs = resolveScreenshotPath(f.path);
    if (!abs) throw new Error(`Invalid frame path: ${f.path}`);
    return abs;
  });
}

export function evidenceRefToFlatIndex(
  manifest: FlatFrameRef[],
  ref: { videoIndex: number; frameIndex: number }
): number | null {
  const hit = manifest.find(
    (f) => f.videoIndex === ref.videoIndex && f.frameIndex === ref.frameIndex
  );
  return hit ? hit.flatIndex : null;
}

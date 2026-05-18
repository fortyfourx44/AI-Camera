import fs from "node:fs/promises";
import path from "node:path";

import { resolveScreenshotPath } from "./paths";
import type { FlatFrameRef, VideoInspectionReport } from "./types";

function indicesToEmbed(inspection: VideoInspectionReport): number[] {
  const set = new Set<number>();
  for (const i of inspection.evidenceFrameIndices) {
    if (Number.isInteger(i) && i >= 0) set.add(i);
  }
  for (const f of inspection.findings) {
    for (const i of f.frameIndices) {
      if (Number.isInteger(i) && i >= 0) set.add(i);
    }
  }
  if (set.size === 0 && inspection.framePaths.length > 0) {
    set.add(Math.floor(inspection.framePaths.length / 2));
  }
  return [...set].sort((a, b) => a - b);
}

async function fileToDataUrl(absPath: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Embed evidence frames as data URLs so the UI works on serverless (no shared /tmp). */
export async function embedInspectionFrameDataUrls(
  inspection: VideoInspectionReport,
  manifest?: FlatFrameRef[]
): Promise<VideoInspectionReport> {
  const frameDataUrls: Record<string, string> = {};
  const absByIndex = new Map<number, string>();

  if (manifest?.length) {
    for (const f of manifest) {
      const abs = resolveScreenshotPath(f.path);
      if (abs) absByIndex.set(f.flatIndex, abs);
    }
  }

  for (const idx of indicesToEmbed(inspection)) {
    let abs = absByIndex.get(idx);
    if (!abs) {
      const rel = inspection.framePaths[idx];
      if (rel) abs = resolveScreenshotPath(rel) ?? undefined;
    }
    if (!abs) continue;
    const dataUrl = await fileToDataUrl(abs);
    if (dataUrl) frameDataUrls[String(idx)] = dataUrl;
  }

  return Object.keys(frameDataUrls).length > 0
    ? { ...inspection, frameDataUrls }
    : inspection;
}

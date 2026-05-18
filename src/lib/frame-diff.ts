import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ffmpegAvailable } from "./ffmpeg";

const execFileP = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

/** Crude motion proxy when ffmpeg is unavailable (e.g. Vercel serverless). */
async function chunkHasMovementWithoutFfmpeg(
  framePaths: string[]
): Promise<{ moved: boolean; minPsnr: number; maxPsnr: number }> {
  if (framePaths.length < 2) return { moved: true, minPsnr: 0, maxPsnr: 0 };
  const sizes: number[] = [];
  for (const p of framePaths) {
    try {
      const st = await fs.stat(p);
      sizes.push(st.size);
    } catch {
      return { moved: true, minPsnr: 0, maxPsnr: 0 };
    }
  }
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  const moved = max - min > 1500;
  return { moved, minPsnr: min, maxPsnr: max };
}

/**
 * Cheap inter-frame similarity gate for the snapshot pipeline.
 *
 * Shells out to ffmpeg's built-in PSNR filter to measure how similar two
 * JPEGs are on the Y (luma) channel. PSNR is in dB — higher means more
 * similar. Roughly:
 *   PSNR > 45 dB  -> essentially identical (sensor noise only)
 *   PSNR 35-45 dB -> small changes (lighting, shadow, distant motion)
 *   PSNR 25-35 dB -> clear motion in the scene
 *   PSNR < 25 dB  -> significant scene change
 *
 * We don't need sub-pixel accuracy; we just need a coarse "anything happened?"
 * gate. ffmpeg is already a hard dependency, so this adds zero new packages.
 */

export interface FrameComparison {
  psnr: number;
  identical: boolean;
}

export const IDENTICAL_PSNR_DB = 45;

export async function compareFrames(
  a: string,
  b: string,
  identicalThreshold = IDENTICAL_PSNR_DB
): Promise<FrameComparison> {
  let stderr = "";
  try {
    const res = await execFileP(FFMPEG, [
      "-loglevel",
      "info",
      "-i",
      a,
      "-i",
      b,
      "-filter_complex",
      "[0:v][1:v]scale2ref=iw:ih[a][b];[a][b]psnr",
      "-f",
      "null",
      "-",
    ]);
    stderr = res.stderr;
  } catch (err) {
    // Non-zero exit is common here when ffmpeg can't produce a valid output
    // file. We still get stderr with the filter's PSNR log line; keep going.
    const e = err as { stderr?: string };
    stderr = e.stderr ?? "";
  }

  // Filter prints:  "[Parsed_psnr_1 @ 0x...] PSNR y:48.123 u:52.01 v:... average:49.1 ..."
  // "inf" shows up when the frames are byte-identical; treat it as huge.
  const match = stderr.match(/PSNR\s+y:([-\d.inf]+)/i);
  if (!match) {
    // Couldn't parse PSNR — be conservative and say "not identical" so the
    // analyzer doesn't silently drop chunks when the gate is broken.
    return { psnr: 0, identical: false };
  }
  const raw = match[1].toLowerCase();
  const psnr = raw === "inf" ? 1000 : Number(raw);
  const safe = Number.isFinite(psnr) ? psnr : 0;
  return {
    psnr: safe,
    identical: safe >= identicalThreshold,
  };
}

/**
 * Returns true if every adjacent pair of frames is "identical" per PSNR,
 * i.e. nothing moved in the scene across the whole chunk. A single pair
 * below the threshold is enough to mark the chunk as active.
 *
 * Evaluates in order and short-circuits as soon as activity is detected.
 */
export async function chunkHasMovement(
  framePaths: string[],
  identicalThreshold = IDENTICAL_PSNR_DB
): Promise<{ moved: boolean; minPsnr: number; maxPsnr: number }> {
  if (framePaths.length < 2) return { moved: true, minPsnr: 0, maxPsnr: 0 };
  if (!(await ffmpegAvailable())) {
    return chunkHasMovementWithoutFfmpeg(framePaths);
  }
  let minPsnr = Number.POSITIVE_INFINITY;
  let maxPsnr = 0;
  for (let i = 1; i < framePaths.length; i++) {
    const cmp = await compareFrames(
      framePaths[i - 1],
      framePaths[i],
      identicalThreshold
    );
    if (cmp.psnr < minPsnr) minPsnr = cmp.psnr;
    if (cmp.psnr > maxPsnr) maxPsnr = cmp.psnr;
    if (!cmp.identical) {
      return { moved: true, minPsnr, maxPsnr };
    }
  }
  return { moved: false, minPsnr, maxPsnr };
}

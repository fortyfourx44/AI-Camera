import { NextRequest, NextResponse } from "next/server";

import {
  addClipToBatch,
  clearActiveBatch,
  getActiveVideoBatch,
  getOrCreateActiveBatch,
} from "@/lib/video-batch";
import { MAX_VIDEOS_PER_BATCH } from "@/lib/video-batch-constants";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const batch = getActiveVideoBatch();
    return NextResponse.json({ batch });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }
}

/** Append one video's sampled frames to the active batch. */
export async function POST(req: NextRequest) {
  try {
    const batch = await getOrCreateActiveBatch();
    if (batch.videos.length >= MAX_VIDEOS_PER_BATCH) {
      return NextResponse.json(
        { error: `Maximum ${MAX_VIDEOS_PER_BATCH} videos per batch.` },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const name = (form.get("name") as string) || "Video";
    const durationRaw = form.get("durationSeconds");
    const durationSeconds =
      typeof durationRaw === "string" ? parseFloat(durationRaw) : 0;

    let frameTimestamps: string[] = [];
    const tsRaw = form.get("frameTimestamps");
    if (typeof tsRaw === "string" && tsRaw.trim()) {
      try {
        frameTimestamps = JSON.parse(tsRaw) as string[];
      } catch {
        frameTimestamps = [];
      }
    }

    const frames: { buffer: Buffer; ext?: string }[] = [];
    const entries = [...form.entries()].filter(([k]) => k.startsWith("frame"));
    entries.sort(([a], [b]) => a.localeCompare(b));
    for (const [, value] of entries) {
      if (!(value instanceof File)) continue;
      const buf = Buffer.from(await value.arrayBuffer());
      const ext = value.type === "image/png" ? ".png" : ".jpg";
      frames.push({ buffer: buf, ext });
    }

    if (frames.length === 0) {
      return NextResponse.json({ error: "No frames uploaded" }, { status: 400 });
    }

    const updated = await addClipToBatch({
      name,
      frames,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      frameTimestamps,
    });

    return NextResponse.json({ batch: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    clearActiveBatch();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

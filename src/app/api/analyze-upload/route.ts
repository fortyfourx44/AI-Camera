import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

import { analyzeUploadedFile } from "@/lib/analyzer";
import { ffmpegAvailable } from "@/lib/ffmpeg";
import { isClaudeConfigured } from "@/lib/claude";
import { RECORDINGS_DIR, ensureDirs } from "@/lib/paths";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  if (!isClaudeConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set. Add it to .env.local and restart." },
      { status: 400 }
    );
  }
  if (!(await ffmpegAvailable())) {
    return NextResponse.json(
      { error: "ffmpeg not available. Install ffmpeg and restart." },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  const name = (form.get("name") as string) || "Uploaded video";
  const rawStartTime = form.get("videoStartTime");
  let userStartTime: Date | undefined;
  if (typeof rawStartTime === "string" && rawStartTime.trim()) {
    const d = new Date(rawStartTime);
    if (Number.isFinite(d.getTime())) userStartTime = d;
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  ensureDirs();
  const uploadDir = path.join(RECORDINGS_DIR, "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const ext = path.extname(file.name) || ".mp4";
  const dest = path.join(uploadDir, `${crypto.randomUUID()}${ext}`);
  const arrayBuf = await file.arrayBuffer();
  await fs.writeFile(dest, new Uint8Array(arrayBuf));

  try {
    const summary = await analyzeUploadedFile({
      filePath: dest,
      streamName: name,
      videoStartTime: userStartTime,
      originalFilename: file.name,
    });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { chatRepo, reportsRepo } from "@/lib/db";
import {
  chatWithReports,
  inspectVideoFrames,
  isClaudeConfigured,
} from "@/lib/claude";
import {
  batchSummaryLabel,
  buildFlatFrameManifest,
  flatFrameAbsPaths,
  getActiveVideoBatch,
  setActiveVideoBatchId,
} from "@/lib/video-batch";

export const runtime = "nodejs";
export const maxDuration = 60;

const postSchema = z.object({
  message: z.string().min(1).max(4000),
});

export async function GET() {
  try {
    const messages = chatRepo.list(200);
    const batch = getActiveVideoBatch();
    return NextResponse.json({ messages, batch });
  } catch {
    return NextResponse.json({ messages: [], batch: null });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  if (!isClaudeConfigured()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY not set. Add it in Vercel Environment Variables or .env.local.",
      },
      { status: 400 }
    );
  }

  const batch = getActiveVideoBatch();
  if (!batch || batch.videos.length === 0) {
    return NextResponse.json(
      { error: "Upload at least one video before asking a question." },
      { status: 400 }
    );
  }

  setActiveVideoBatchId(batch.id);

  const userMsg = {
    id: crypto.randomUUID(),
    role: "user" as const,
    content: parsed.data.message,
    createdAt: Date.now(),
    videoSessionId: batch.id,
  };
  chatRepo.insert(userMsg);

  const history = chatRepo
    .list(20)
    .filter((m) => m.id !== userMsg.id)
    .map((m) => ({ role: m.role, content: m.content }));

  const manifest = buildFlatFrameManifest(batch);
  const framePathsRelative = manifest.map((f) => f.path);
  const frameLabels = manifest.map(
    (f) =>
      `Video ${f.videoIndex} "${f.videoName}" @ ${f.timestampLabel} — frame ${f.frameIndex}`
  );
  const videosMeta = batch.videos.map((v) => ({
    name: v.name,
    durationSeconds: v.durationSeconds,
    frameCount: v.framePaths.length,
  }));

  let assistantText: string;
  let inspection: import("@/lib/types").VideoInspectionReport | null = null;
  try {
    if (manifest.length > 0) {
      const result = await inspectVideoFrames({
        framePaths: flatFrameAbsPaths(manifest),
        framePathsRelative,
        frameLabels,
        manifest,
        userQuestion: parsed.data.message,
        videoLabel: batchSummaryLabel(batch),
        videosMeta,
        history,
      });
      assistantText = result.content;
      inspection = result.inspection;
    } else {
      const reports = reportsRepo.list(50);
      assistantText = await chatWithReports({
        userMessage: parsed.data.message,
        reports,
        history,
      });
    }
  } catch (err) {
    assistantText = `Sorry — I hit an error talking to Claude: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  const assistantMsg = {
    id: crypto.randomUUID(),
    role: "assistant" as const,
    content: assistantText,
    createdAt: Date.now(),
    videoSessionId: batch.id,
    inspection,
  };
  chatRepo.insert(assistantMsg);

  return NextResponse.json({
    user: userMsg,
    assistant: assistantMsg,
    batch,
  });
}

export async function DELETE() {
  chatRepo.clear();
  return NextResponse.json({ ok: true });
}

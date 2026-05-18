import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { chatRepo, reportsRepo, videoSessionRepo } from "@/lib/db";
import {
  chatWithReports,
  inspectVideoFrames,
  isClaudeConfigured,
} from "@/lib/claude";
import {
  getActiveVideoSession,
  getActiveVideoSessionId,
  sessionFrameAbsPaths,
  setActiveVideoSessionId,
} from "@/lib/video-session";

export const runtime = "nodejs";

const postSchema = z.object({
  message: z.string().min(1).max(4000),
  sessionId: z.string().uuid().optional(),
});

export async function GET() {
  try {
    const messages = chatRepo.list(200);
    const session = getActiveVideoSession();
    return NextResponse.json({ messages, session });
  } catch {
    return NextResponse.json({ messages: [], session: null });
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

  const sessionId =
    parsed.data.sessionId ?? getActiveVideoSessionId() ?? undefined;
  let session = sessionId ? videoSessionRepo.get(sessionId) : null;
  if (sessionId && !session) {
    return NextResponse.json(
      { error: "Video session not found. Record or upload a clip first." },
      { status: 400 }
    );
  }
  if (session) setActiveVideoSessionId(session.id);

  const userMsg = {
    id: crypto.randomUUID(),
    role: "user" as const,
    content: parsed.data.message,
    createdAt: Date.now(),
    videoSessionId: session?.id ?? null,
  };
  chatRepo.insert(userMsg);

  const history = chatRepo
    .list(20)
    .filter((m) => m.id !== userMsg.id)
    .map((m) => ({ role: m.role, content: m.content }));

  let assistantText: string;
  try {
    if (session && session.framePaths.length > 0) {
      assistantText = await inspectVideoFrames({
        framePaths: sessionFrameAbsPaths(session),
        userQuestion: parsed.data.message,
        videoLabel: session.name,
        history,
      });
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
    videoSessionId: session?.id ?? null,
  };
  chatRepo.insert(assistantMsg);

  return NextResponse.json({
    user: userMsg,
    assistant: assistantMsg,
    session,
  });
}

export async function DELETE() {
  chatRepo.clear();
  setActiveVideoSessionId(null);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { chatRepo, reportsRepo } from "@/lib/db";
import { chatWithReports, isClaudeConfigured } from "@/lib/claude";

export const runtime = "nodejs";

const postSchema = z.object({
  message: z.string().min(1).max(4000),
});

export async function GET() {
  const messages = chatRepo.list(200);
  return NextResponse.json({ messages });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  if (!isClaudeConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set. Add it to .env.local and restart." },
      { status: 400 }
    );
  }

  const userMsg = {
    id: crypto.randomUUID(),
    role: "user" as const,
    content: parsed.data.message,
    createdAt: Date.now(),
  };
  chatRepo.insert(userMsg);

  const history = chatRepo.list(20).map((m) => ({ role: m.role, content: m.content }));
  const reports = reportsRepo.list(200);

  let assistantText: string;
  try {
    assistantText = await chatWithReports({
      userMessage: parsed.data.message,
      reports,
      history: history.slice(0, -1),
    });
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
  };
  chatRepo.insert(assistantMsg);

  return NextResponse.json({ user: userMsg, assistant: assistantMsg });
}

export async function DELETE() {
  chatRepo.clear();
  return NextResponse.json({ ok: true });
}

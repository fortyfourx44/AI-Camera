import { NextRequest, NextResponse } from "next/server";
import { startStreamAnalysis } from "@/lib/analyzer";
import { ffmpegAvailable } from "@/lib/ffmpeg";
import { isClaudeConfigured } from "@/lib/claude";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isClaudeConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set. Add it to .env.local and restart." },
      { status: 400 }
    );
  }
  if (!(await ffmpegAvailable())) {
    return NextResponse.json(
      {
        error:
          "ffmpeg is not installed or not on PATH. Install it (brew install ffmpeg on macOS) and restart.",
      },
      { status: 400 }
    );
  }
  const { id } = await ctx.params;
  let durationMinutes = 0;
  try {
    const body = (await req.json().catch(() => null)) as {
      durationMinutes?: unknown;
    } | null;
    if (body && typeof body.durationMinutes === "number" && Number.isFinite(body.durationMinutes)) {
      durationMinutes = Math.max(0, Math.min(24 * 60, Math.floor(body.durationMinutes)));
    }
  } catch {
    durationMinutes = 0;
  }
  const autoStopAfterMs = durationMinutes > 0 ? durationMinutes * 60 * 1000 : null;
  try {
    await startStreamAnalysis(id, { autoStopAfterMs });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

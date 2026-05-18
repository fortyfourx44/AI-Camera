import { NextRequest, NextResponse } from "next/server";
import { streamsRepo } from "@/lib/db";
import { stopStreamAnalysis } from "@/lib/analyzer";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await stopStreamAnalysis(id).catch(() => {});
  streamsRepo.delete(id);
  return NextResponse.json({ ok: true });
}

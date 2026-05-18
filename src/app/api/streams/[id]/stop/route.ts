import { NextRequest, NextResponse } from "next/server";
import { stopStreamAnalysis } from "@/lib/analyzer";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await stopStreamAnalysis(id);
  return NextResponse.json({ ok: true });
}

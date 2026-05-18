import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import { reportsRepo } from "@/lib/db";
import { SCREENSHOTS_DIR } from "@/lib/paths";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const report = reportsRepo.get(id);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ report });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const report = reportsRepo.get(id);
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Best-effort cleanup of the evidence screenshots on disk.
  for (const rel of report.screenshots) {
    const abs = path.resolve(process.cwd(), rel);
    if (abs.startsWith(SCREENSHOTS_DIR)) {
      try {
        await fs.unlink(abs);
      } catch {
        // ignore
      }
    }
  }
  reportsRepo.delete(id);
  return NextResponse.json({ ok: true });
}

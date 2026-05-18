import { NextResponse } from "next/server";
import { reportsRepo } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const reports = reportsRepo.list(200);
  return NextResponse.json({ reports, total: reports.length });
}

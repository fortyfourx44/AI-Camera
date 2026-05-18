import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { streamsRepo } from "@/lib/db";
import type { CameraStream } from "@/lib/types";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  rtspUrl: z.string().min(4),
});

export async function GET() {
  try {
    // Hide synthetic upload "streams" that old versions may have inserted.
    const streams = streamsRepo
      .list()
      .filter((s) => !s.rtspUrl.startsWith("file://"));
    return NextResponse.json({ streams });
  } catch (err) {
    return NextResponse.json(
      {
        streams: [],
        error: err instanceof Error ? err.message : "Database unavailable",
      },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const stream: CameraStream = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    rtspUrl: parsed.data.rtspUrl,
    status: "idle",
    createdAt: Date.now(),
    lastActiveAt: null,
    errorMessage: null,
    sourceType: "rtsp",
    sourceConfig: null,
  };
  streamsRepo.insert(stream);
  return NextResponse.json({ stream });
}

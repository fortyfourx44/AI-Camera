import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";

import { startStreamAnalysis } from "@/lib/analyzer";
import { isClaudeConfigured } from "@/lib/claude";
import { streamsRepo } from "@/lib/db";
import type { CameraStream } from "@/lib/types";

export const runtime = "nodejs";

const importSchema = z.object({
  selections: z
    .array(
      z.object({
        deviceSerial: z.string().min(1),
        cameraId: z.string().min(1),
        channelNo: z.number().int().min(1).max(64),
        name: z.string().min(1).max(80),
        quality: z.enum(["sub", "main"]).default("sub"),
        pollIntervalSec: z.number().int().min(5).max(300).default(20),
        framesPerChunk: z.number().int().min(2).max(24).default(12),
      })
    )
    .min(1)
    .max(32),
  /** 0 = until stopped. Max 24h. */
  runDurationMinutes: z.number().int().min(0).max(24 * 60).optional().default(0),
});

/**
 * Creates one `streams` row per selected Hik-Connect camera with
 * `sourceType: "hikconnect"` and the full `sourceConfig`. These cameras are
 * driven by the snapshot-poller pipeline (no RTSP). The `rtsp_url` column
 * gets a synthetic `hikconnect://` label — it's only used for display and
 * satisfies the NOT NULL constraint on the legacy column.
 *
 * De-dupes against existing streams on (deviceSerial, channelNo) so the
 * endpoint is idempotent when the user re-submits the same selection.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400 }
    );
  }

  const existing = new Set(
    streamsRepo
      .list()
      .filter((s) => s.sourceType === "hikconnect" && s.sourceConfig)
      .map((s) => `${s.sourceConfig!.deviceSerial}:${s.sourceConfig!.channelNo}`)
  );

  const createdIds: string[] = [];
  const skipped: string[] = [];

  for (const sel of parsed.data.selections) {
    const key = `${sel.deviceSerial}:${sel.channelNo}`;
    if (existing.has(key)) {
      skipped.push(key);
      continue;
    }
    const id = crypto.randomUUID();
    const stream: CameraStream = {
      id,
      name: sel.name,
      rtspUrl: `hikconnect://${sel.deviceSerial}/${sel.channelNo}`,
      status: "idle",
      createdAt: Date.now(),
      lastActiveAt: null,
      errorMessage: null,
      sourceType: "hikconnect",
      sourceConfig: {
        deviceSerial: sel.deviceSerial,
        cameraId: sel.cameraId,
        channelNo: sel.channelNo,
        quality: sel.quality,
        pollIntervalSec: sel.pollIntervalSec,
        framesPerChunk: sel.framesPerChunk,
      },
    };
    streamsRepo.insert(stream);
    createdIds.push(id);
  }

  // "Select cameras and keep feeding the AI" — auto-start snapshot polling
  // for each camera the user just imported, so they don't have to press Play
  // on every row individually. We skip the auto-start when Claude isn't
  // configured (would just waste cloud snapshot calls) and tolerate per-stream
  // failures so one bad camera doesn't block the others.
  let autoStarted = 0;
  const autoStartErrors: string[] = [];
  const autoStopAfterMs =
    parsed.data.runDurationMinutes > 0
      ? parsed.data.runDurationMinutes * 60 * 1000
      : null;
  if (createdIds.length > 0 && isClaudeConfigured()) {
    for (const id of createdIds) {
      try {
        await startStreamAnalysis(id, { autoStopAfterMs });
        autoStarted += 1;
      } catch (err) {
        autoStartErrors.push(
          `${id.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    imported: createdIds,
    skipped,
    autoStarted,
    claudeConfigured: isClaudeConfigured(),
    autoStartErrors: autoStartErrors.length > 0 ? autoStartErrors : undefined,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  COMPLIANCE_PRESETS,
  getAppSettings,
  getDefaultSettings,
  getSettingsDatabaseError,
  isSettingsPersistenceAvailable,
  resetAppSettings,
  updateAppSettings,
} from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 30;

function payload() {
  return {
    ...getAppSettings(),
    defaults: getDefaultSettings(),
    presets: COMPLIANCE_PRESETS,
    persistenceAvailable: isSettingsPersistenceAvailable(),
    databaseError: getSettingsDatabaseError(),
  };
}

export async function GET() {
  try {
    return NextResponse.json(payload());
  } catch (err) {
    return NextResponse.json({
      ...getDefaultSettings(),
      defaults: getDefaultSettings(),
      presets: COMPLIANCE_PRESETS,
      persistenceAvailable: false,
      databaseError: err instanceof Error ? err.message : String(err),
    });
  }
}

const patchSchema = z.object({
  analysisPrompt: z.string().min(10).max(20_000).optional(),
  chatPrompt: z.string().min(10).max(20_000).optional(),
  framesPerChunk: z.number().int().min(1).max(20).optional(),
  motionThreshold: z.number().min(0).max(1).optional(),
  activePresets: z.array(z.string()).optional(),
  storeContext: z.string().max(10_000).optional(),
});

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  try {
    updateAppSettings(parsed.data);
    return NextResponse.json(payload());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    resetAppSettings();
    return NextResponse.json(payload());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

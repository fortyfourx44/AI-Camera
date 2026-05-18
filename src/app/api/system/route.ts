import { NextResponse } from "next/server";
import { ffmpegAvailable } from "@/lib/ffmpeg";
import { isClaudeConfigured } from "@/lib/claude";
import { getDatabaseError, isDatabaseReady, reportsRepo, streamsRepo } from "@/lib/db";
import { COMPLIANCE_PRESETS, getAppSettings } from "@/lib/prompts";
import { reconcileServerlessStreamState } from "@/lib/serverless-guard";
import {
  getDeploymentMode,
  getDeploymentWarnings,
  isServerlessDeployment,
} from "@/lib/runtime";

export const runtime = "nodejs";

export async function GET() {
  reconcileServerlessStreamState();
  const [ffmpeg] = await Promise.all([ffmpegAvailable()]);
  let streams = 0;
  let reports = 0;
  if (isDatabaseReady()) {
    streams = streamsRepo.list().length;
    reports = reportsRepo.count();
  }
  const settings = getAppSettings();
  const activeRules = settings.activePresets
    .map((id) => COMPLIANCE_PRESETS.find((p) => p.id === id))
    .filter((p): p is (typeof COMPLIANCE_PRESETS)[number] => !!p)
    .map((p) => ({ id: p.id, label: p.label }));
  return NextResponse.json({
    ffmpeg,
    claude: isClaudeConfigured(),
    streams,
    reports,
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    activeRules,
    deployment: getDeploymentMode(),
    serverless: isServerlessDeployment(),
    database: isDatabaseReady(),
    databaseError: getDatabaseError(),
    warnings: getDeploymentWarnings(),
  });
}

import { NextResponse } from "next/server";
import { ffmpegAvailable } from "@/lib/ffmpeg";
import { isClaudeConfigured } from "@/lib/claude";
import { reportsRepo, streamsRepo } from "@/lib/db";
import { COMPLIANCE_PRESETS, getAppSettings } from "@/lib/prompts";

export const runtime = "nodejs";

export async function GET() {
  const [ffmpeg] = await Promise.all([ffmpegAvailable()]);
  const settings = getAppSettings();
  const activeRules = settings.activePresets
    .map((id) => COMPLIANCE_PRESETS.find((p) => p.id === id))
    .filter((p): p is (typeof COMPLIANCE_PRESETS)[number] => !!p)
    .map((p) => ({ id: p.id, label: p.label }));
  return NextResponse.json({
    ffmpeg,
    claude: isClaudeConfigured(),
    streams: streamsRepo.list().length,
    reports: reportsRepo.count(),
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
    activeRules,
  });
}

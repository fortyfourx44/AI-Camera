import type { VideoBatch } from "./types";

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatOffset(
  durationSeconds: number,
  frameIndex: number,
  frameCount: number
): string {
  const t =
    durationSeconds > 0
      ? (durationSeconds * (frameIndex + 0.5)) / Math.max(1, frameCount)
      : 0;
  return formatDuration(t);
}

export function batchSummaryLabel(batch: VideoBatch): string {
  if (batch.videos.length === 0) return "No videos";
  const totalSec = batch.videos.reduce((a, v) => a + v.durationSeconds, 0);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const dur =
    h > 0 ? `${h}h ${m}m` : m > 0 ? `${m} min` : `${Math.round(totalSec)}s`;
  return `${batch.videos.length} video${batch.videos.length === 1 ? "" : "s"} (${dur} total)`;
}

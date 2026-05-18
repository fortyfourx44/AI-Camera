import { formatDuration } from "./video-format";
import { FRAMES_PER_VIDEO } from "./video-batch-constants";

export type ExtractProgress = (pct: number, label: string) => void;

/**
 * Browser-only: sample frames from a video Blob without ffmpeg (works on Vercel).
 * Frames are spread evenly across the full duration (including 24h+ files).
 */
export async function extractVideoFrames(
  file: Blob,
  frameCount = FRAMES_PER_VIDEO,
  onProgress?: ExtractProgress
): Promise<{
  blobs: Blob[];
  durationSeconds: number;
  timestamps: string[];
}> {
  onProgress?.(0, "Loading video…");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load video"));
  });

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const count = Math.max(4, Math.min(FRAMES_PER_VIDEO, frameCount));
  const canvas = document.createElement("canvas");
  const w = Math.min(video.videoWidth || 640, 1280);
  const h = Math.min(video.videoHeight || 360, 720);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const blobs: Blob[] = [];
  const timestamps: string[] = [];

  for (let i = 0; i < count; i++) {
    onProgress?.(
      Math.round(((i + 0.5) / count) * 100),
      duration > 3600
        ? `Sampling long video… ${i + 1}/${count}`
        : `Extracting frame ${i + 1}/${count}`
    );
    const t =
      duration > 0 ? (duration * (i + 0.5)) / count : i / Math.max(1, count - 1);
    timestamps.push(formatDuration(t));
    video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    await new Promise<void>((r) => {
      video.onseeked = () => r();
    });
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Frame capture failed"))),
        "image/jpeg",
        0.85
      );
    });
    blobs.push(blob);
  }

  URL.revokeObjectURL(url);
  onProgress?.(100, "Done");
  return { blobs, durationSeconds: duration, timestamps };
}

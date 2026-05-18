/**
 * Browser-only: sample frames from a video Blob without ffmpeg (works on Vercel).
 */
export async function extractVideoFrames(
  file: Blob,
  frameCount = 12
): Promise<{ blobs: Blob[]; durationSeconds: number }> {
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
  const count = Math.max(4, Math.min(16, frameCount));
  const canvas = document.createElement("canvas");
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 360;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const blobs: Blob[] = [];
  for (let i = 0; i < count; i++) {
    const t =
      duration > 0 ? (duration * (i + 0.5)) / count : i / Math.max(1, count - 1);
    video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    await new Promise<void>((r) => {
      video.onseeked = () => r();
    });
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Frame capture failed"))),
        "image/jpeg",
        0.88
      );
    });
    blobs.push(blob);
  }

  URL.revokeObjectURL(url);
  return { blobs, durationSeconds: duration };
}

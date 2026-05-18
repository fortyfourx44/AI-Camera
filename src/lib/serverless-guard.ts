import { streamsRepo } from "./db";
import { isServerlessDeployment } from "./runtime";
import type { CameraStream } from "./types";

const SERVERLESS_LIVE_MSG =
  "Live camera monitoring (RTSP / Hik-Connect polling) cannot run on Vercel serverless. Deploy on a VPS or Docker host with ffmpeg, or use the app locally.";

export function assertLiveMonitoringAllowed(stream?: CameraStream | null): void {
  if (!isServerlessDeployment()) return;
  void stream;
  throw new Error(SERVERLESS_LIVE_MSG);
}

export function getServerlessLiveMonitoringMessage(): string {
  return SERVERLESS_LIVE_MSG;
}

/** Reset stale "recording" flags after serverless cold starts. */
export function reconcileServerlessStreamState(): void {
  if (!isServerlessDeployment()) return;
  try {
    for (const s of streamsRepo.list()) {
      if (s.status === "recording" || s.status === "analyzing") {
        streamsRepo.updateStatus(
          s.id,
          "idle",
          "Stopped automatically (serverless — use a VPS for 24/7 monitoring)."
        );
      }
    }
  } catch {
    // DB may be unavailable during build; ignore.
  }
}

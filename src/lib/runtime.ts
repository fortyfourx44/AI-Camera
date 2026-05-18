/**
 * Deployment environment helpers (Vercel serverless vs long-running Node).
 */

/** True on Vercel builds and production/preview deployments. */
export function isVercel(): boolean {
  return process.env.VERCEL === "1";
}

/**
 * Serverless: no persistent disk, no background ffmpeg workers, function timeouts.
 * Use a VPS/Docker host for 24/7 RTSP ingestion.
 */
export function isServerlessDeployment(): boolean {
  return isVercel();
}

export type DeploymentMode = "serverless" | "standalone";

export function getDeploymentMode(): DeploymentMode {
  return isServerlessDeployment() ? "serverless" : "standalone";
}

export function getDeploymentWarnings(): string[] {
  if (!isServerlessDeployment()) return [];
  return [
    "Vercel serverless: SQLite and uploads use /tmp (data resets on cold starts).",
    "RTSP/ffmpeg recording and live camera polling require a VPS or Docker host.",
    "Set ANTHROPIC_API_KEY in Vercel project Environment Variables.",
  ];
}

import path from "node:path";
import fs from "node:fs";
import { isServerlessDeployment } from "./runtime";

/** Writable base on Vercel/Lambda (/tmp only). */
export const SERVERLESS_STORAGE_ROOT = path.join("/tmp", "ai-ip-cam");

function storageRoot(): string {
  if (isServerlessDeployment()) {
    return SERVERLESS_STORAGE_ROOT;
  }
  return process.cwd();
}

/**
 * Resolve a storage subdirectory. On serverless, always use /tmp (ignore
 * DATA_DIR=./data from Vercel env — that resolves to read-only /var/task/data).
 */
function resolveStorageDir(
  envValue: string | undefined,
  subdir: "data" | "recordings" | "screenshots"
): string {
  if (isServerlessDeployment()) {
    return path.join(SERVERLESS_STORAGE_ROOT, subdir);
  }
  return path.resolve(envValue || path.join(process.cwd(), subdir));
}

export const DATA_DIR = resolveStorageDir(process.env.DATA_DIR, "data");
export const RECORDINGS_DIR = resolveStorageDir(
  process.env.RECORDINGS_DIR,
  "recordings"
);
export const SCREENSHOTS_DIR = resolveStorageDir(
  process.env.SCREENSHOTS_DIR,
  "screenshots"
);

export const DB_PATH = path.join(DATA_DIR, "ai-ip-cam.sqlite");

export function ensureDirs() {
  for (const dir of [DATA_DIR, RECORDINGS_DIR, SCREENSHOTS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/** Stable path for DB/API (always includes `screenshots/` prefix). */
export function toStoredScreenshotPath(absPath: string): string {
  const rel = path.relative(SCREENSHOTS_DIR, absPath);
  return path.posix.join("screenshots", rel.split(path.sep).join("/"));
}

/** Resolve a stored screenshot path (absolute or relative) under SCREENSHOTS_DIR. */
export function resolveScreenshotPath(storedPath: string): string | null {
  const normalized = storedPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const idx = parts.findIndex((p) => p === "screenshots");
  const rel =
    idx >= 0 ? parts.slice(idx + 1).join("/") : path.basename(normalized);
  if (!rel || rel.includes("..")) return null;
  const abs = path.resolve(SCREENSHOTS_DIR, rel);
  const rootResolved = path.resolve(SCREENSHOTS_DIR);
  if (!abs.startsWith(rootResolved + path.sep) && abs !== rootResolved) {
    return null;
  }
  return abs;
}

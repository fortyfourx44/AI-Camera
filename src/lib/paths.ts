import path from "node:path";
import fs from "node:fs";
import { isServerlessDeployment } from "./runtime";

const root = process.cwd();

/** Writable base directory (project root locally, /tmp on Vercel). */
function storageRoot(): string {
  if (isServerlessDeployment()) {
    return path.join("/tmp", "ai-ip-cam");
  }
  return root;
}

const base = storageRoot();

export const DATA_DIR = path.resolve(
  process.env.DATA_DIR || path.join(base, "data")
);
export const RECORDINGS_DIR = path.resolve(
  process.env.RECORDINGS_DIR || path.join(base, "recordings")
);
export const SCREENSHOTS_DIR = path.resolve(
  process.env.SCREENSHOTS_DIR || path.join(base, "screenshots")
);

export const DB_PATH = path.join(DATA_DIR, "ai-ip-cam.sqlite");

export function ensureDirs() {
  for (const dir of [DATA_DIR, RECORDINGS_DIR, SCREENSHOTS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
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

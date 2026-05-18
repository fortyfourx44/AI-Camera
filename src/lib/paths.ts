import path from "node:path";
import fs from "node:fs";

const root = process.cwd();

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(root, "data"));
export const RECORDINGS_DIR = path.resolve(
  process.env.RECORDINGS_DIR || path.join(root, "recordings")
);
export const SCREENSHOTS_DIR = path.resolve(
  process.env.SCREENSHOTS_DIR || path.join(root, "screenshots")
);

export const DB_PATH = path.join(DATA_DIR, "ai-ip-cam.sqlite");

export function ensureDirs() {
  for (const dir of [DATA_DIR, RECORDINGS_DIR, SCREENSHOTS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

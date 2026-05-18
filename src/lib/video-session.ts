import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

import { settingsRepo, videoSessionRepo } from "./db";
import { SCREENSHOTS_DIR, ensureDirs } from "./paths";
import { K_ACTIVE_VIDEO_SESSION } from "./prompts";
import type { VideoSession } from "./types";

export function getActiveVideoSessionId(): string | null {
  return settingsRepo.get(K_ACTIVE_VIDEO_SESSION);
}

export function setActiveVideoSessionId(id: string | null): void {
  if (id) settingsRepo.set(K_ACTIVE_VIDEO_SESSION, id);
  else settingsRepo.delete(K_ACTIVE_VIDEO_SESSION);
}

export function getActiveVideoSession(): VideoSession | null {
  const id = getActiveVideoSessionId();
  if (!id) return null;
  return videoSessionRepo.get(id);
}

/** Absolute paths for frames stored in a session. */
export function sessionFrameAbsPaths(session: VideoSession): string[] {
  return session.framePaths.map((rel) => path.join(process.cwd(), rel));
}

export async function createVideoSessionFromUploads({
  name,
  frames,
  durationSeconds,
}: {
  name: string;
  frames: { buffer: Buffer; ext?: string }[];
  durationSeconds: number;
}): Promise<VideoSession> {
  ensureDirs();
  const id = crypto.randomUUID();
  const sessionDir = path.join(SCREENSHOTS_DIR, "sessions", id);
  await fs.mkdir(sessionDir, { recursive: true });

  const framePaths: string[] = [];
  let i = 0;
  for (const frame of frames) {
    const ext = frame.ext === ".png" ? ".png" : ".jpg";
    const filename = `frame-${String(i).padStart(3, "0")}${ext}`;
    const abs = path.join(sessionDir, filename);
    await fs.writeFile(abs, frame.buffer);
    framePaths.push(path.relative(process.cwd(), abs));
    i++;
  }

  const session: VideoSession = {
    id,
    name,
    framePaths,
    durationSeconds: Math.max(0, durationSeconds),
    createdAt: Date.now(),
  };
  videoSessionRepo.insert(session);
  setActiveVideoSessionId(id);
  return session;
}

/** Max videos per upload batch (user request: up to 10). */
export const MAX_VIDEOS_PER_BATCH = 10;

/** Frames sampled per video (spread evenly — works for 24h clips). */
export const FRAMES_PER_VIDEO = 8;

/** Hard cap on images sent to Claude in one request. */
export const MAX_FRAMES_PER_ANALYSIS = 40;

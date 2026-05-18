export type StreamStatus = "idle" | "recording" | "analyzing" | "error";

export type StreamSourceType = "rtsp" | "hikconnect";

export interface HikConnectSourceConfig {
  deviceSerial: string;
  cameraId: string;
  channelNo: number;
  /** "sub" = lower-bandwidth secondary stream; "main" = full-quality. */
  quality: "sub" | "main";
  /**
   * How often to pull a snapshot for this camera (seconds, 5..300). Default 20.
   * Defaults here are duplicated in the import route + UI form so the stored
   * value is authoritative.
   */
  pollIntervalSec: number;
  /** Frames accumulated before a chunk is submitted to the analyzer. Default 12. */
  framesPerChunk: number;
}

export interface CameraStream {
  id: string;
  name: string;
  /**
   * For RTSP streams this is the rtsp:// URL.
   * For Hik-Connect streams this is a best-effort label (e.g. "hikconnect://<serial>/<channel>");
   * the actual playable URL is resolved at start-time.
   */
  rtspUrl: string;
  status: StreamStatus;
  createdAt: number;
  lastActiveAt: number | null;
  errorMessage?: string | null;
  sourceType: StreamSourceType;
  sourceConfig: HikConnectSourceConfig | null;
}

export type ViolationSeverity = "low" | "medium" | "high";

export interface ViolationReport {
  id: string;
  streamId: string;
  streamName: string;
  detectedAt: number;
  videoTimestamp: number;
  videoTimestampLabel: string;
  chunkPath: string;
  durationSeconds: number;
  cashierDescription: string;
  customerDescription: string;
  summary: string;
  reasoning: string;
  severity: ViolationSeverity;
  confidence: number;
  screenshots: string[];
  /** Indices within `screenshots` that Claude called out as evidence (1–3 items). */
  evidenceIndices: number[];
}

export interface AnalysisResult {
  hasTransaction: boolean;
  receiptHandedToCustomer: boolean | null;
  confidence: number;
  cashierDescription: string;
  customerDescription: string;
  summary: string;
  reasoning: string;
  bestEvidenceFrameIndex: number | null;
  /** The 1–3 most incriminating frame indices (subset of extracted frames). */
  evidenceFrameIndices: number[];
  severity: ViolationSeverity;
  /** Rule ids (e.g. "receipt", "phone") that the model flagged as violated. */
  violatedRules: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  reportRefs?: string[];
  /** When set, this turn used vision on a stored video session. */
  videoSessionId?: string | null;
  /** Structured vision analysis (assistant messages). */
  inspection?: VideoInspectionReport | null;
}

export type InspectionVerdict = "yes" | "no" | "unclear" | "n/a";

export interface InspectionFinding {
  heading: string;
  detail: string;
  frameIndices: number[];
}

/** Structured AI report returned from video inspection. */
export interface VideoInspectionReport {
  title: string;
  userQuestion: string;
  videoName: string;
  analyzedAt: number;
  verdict: InspectionVerdict;
  verdictLabel: string;
  confidence: number;
  summary: string;
  findings: InspectionFinding[];
  evidenceFrameIndices: number[];
  limitations: string;
  conclusion: string;
  /** Snapshot of frame paths at analysis time (for UI + PDF). */
  framePaths: string[];
}

/** On-demand video the user recorded or uploaded for interactive inspection. */
export interface VideoSession {
  id: string;
  name: string;
  /** Relative paths under screenshots/ (e.g. sessions/uuid/frame-00.jpg). */
  framePaths: string[];
  durationSeconds: number;
  createdAt: number;
}

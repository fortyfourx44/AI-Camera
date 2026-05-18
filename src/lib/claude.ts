import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import type { AnalysisResult, ViolationReport } from "./types";
import { COMPLIANCE_PRESETS, getAppSettings, getVideoInspectPrompt } from "./prompts";
import { getServerLocale } from "./i18n-server";
import type { Locale } from "./i18n";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local before starting analysis."
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function fileToImageBlock(file: string): Promise<Anthropic.ImageBlockParam> {
  const buf = await fs.readFile(file);
  const ext = path.extname(file).toLowerCase();
  const media_type: Anthropic.Base64ImageSource["media_type"] =
    ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return {
    type: "image",
    source: {
      type: "base64",
      media_type,
      data: buf.toString("base64"),
    },
  };
}

function languageDirective(locale: Locale): string {
  if (locale === "ar") {
    return `\n\n=== CRITICAL: Output language ===\nWrite ALL natural-language fields in ARABIC (العربية): "summary", "reasoning", "cashierDescription", "customerDescription". The JSON KEYS and the literal values "low"/"medium"/"high" must stay in English exactly as specified. Numbers and booleans stay standard. Do NOT translate field names.`;
  }
  return `\n\n=== CRITICAL: Output language ===\nWrite ALL natural-language fields in ENGLISH.`;
}

export async function analyzeChunk({
  framePaths,
  chunkLabel,
  chunkStartTime,
  chunkDurationSeconds,
}: {
  framePaths: string[];
  chunkLabel: string;
  /** Wall-clock time of the first frame of this chunk. Used to let Claude reference real timestamps. */
  chunkStartTime?: Date | null;
  chunkDurationSeconds?: number;
}): Promise<AnalysisResult> {
  if (framePaths.length === 0) {
    return emptyResult("No frames extracted from chunk.");
  }

  const imageBlocks = await Promise.all(framePaths.map(fileToImageBlock));
  const labeled: Anthropic.ContentBlockParam[] = [];
  imageBlocks.forEach((img, i) => {
    labeled.push({ type: "text", text: `Frame ${i}:` });
    labeled.push(img);
  });
  labeled.push({
    type: "text",
    text: `End of frames for chunk "${chunkLabel}". Respond with the JSON object only.`,
  });

  const settings = getAppSettings();
  const locale = await getServerLocale();
  const parts: string[] = [settings.analysisPrompt];
  if (settings.storeContext?.trim()) {
    parts.push(
      `=== Store-specific context / known exceptions ===\n${settings.storeContext.trim()}`
    );
  }
  if (chunkStartTime && Number.isFinite(chunkStartTime.getTime())) {
    const endTime =
      chunkDurationSeconds != null
        ? new Date(chunkStartTime.getTime() + chunkDurationSeconds * 1000)
        : null;
    const tz =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
    // Deliberately hand Claude ONLY the local wall-clock time (no ISO / no "Z").
    // Passing `.toISOString()` made the model repeat UTC hours back to the user
    // as if they were local time, which is very confusing when the footage is
    // from e.g. 11:02 local but the ISO shows 16:02Z.
    const fmtLocal = (d: Date) =>
      d.toLocaleString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    parts.push(
      `=== Timing context for this chunk ===\n` +
        `Video segment LOCAL wall-clock start (timezone ${tz}): ${fmtLocal(chunkStartTime)}\n` +
        (endTime ? `LOCAL wall-clock end: ${fmtLocal(endTime)}\n` : "") +
        `\nThese times are already the local wall-clock time in the ${tz} timezone. ` +
        `When you reference the time in "summary" or "reasoning", use these exact hours and minutes. ` +
        `Do NOT convert to UTC. Do NOT invent timestamps outside this range.`
    );
  }
  parts.push(languageDirective(locale));
  const systemPrompt = parts.join("\n\n");

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: labeled }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Log the raw response so we can debug why a chunk was / wasn't flagged.
  // This is intentionally verbose — uploads are rare enough that the noise is
  // worth the diagnostic value when the user says "AI missed an obvious violation".
  // eslint-disable-next-line no-console
  console.log(
    `[claude ${chunkLabel}] frames=${framePaths.length} raw=${text.replace(/\s+/g, " ").slice(0, 500)}`
  );

  return parseAnalysisJson(text);
}

function emptyResult(reason: string): AnalysisResult {
  return {
    hasTransaction: false,
    receiptHandedToCustomer: null,
    confidence: 0,
    cashierDescription: "",
    customerDescription: "",
    summary: reason,
    reasoning: reason,
    bestEvidenceFrameIndex: null,
    evidenceFrameIndices: [],
    severity: "low",
    violatedRules: [],
  };
}

function parseAnalysisJson(raw: string): AnalysisResult {
  let jsonText = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) jsonText = fenceMatch[1];
  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    return emptyResult(`Model returned non-JSON: ${raw.slice(0, 200)}`);
  }
  jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  try {
    const obj = JSON.parse(jsonText);
    const best =
      typeof obj.bestEvidenceFrameIndex === "number"
        ? obj.bestEvidenceFrameIndex
        : null;
    let evidence: number[] = [];
    if (Array.isArray(obj.evidenceFrameIndices)) {
      evidence = obj.evidenceFrameIndices
        .filter((n: unknown) => Number.isInteger(n))
        .slice(0, 3);
    } else if (best !== null) {
      evidence = [best];
    }
    const violatedRules: string[] = Array.isArray(obj.violatedRules)
      ? obj.violatedRules
          .filter((r: unknown): r is string => typeof r === "string" && r.length > 0)
          .slice(0, 10)
      : [];
    return {
      hasTransaction: !!obj.hasTransaction,
      receiptHandedToCustomer:
        obj.receiptHandedToCustomer === null || obj.receiptHandedToCustomer === undefined
          ? null
          : !!obj.receiptHandedToCustomer,
      confidence: clamp01(Number(obj.confidence) || 0),
      cashierDescription: String(obj.cashierDescription || ""),
      customerDescription: String(obj.customerDescription || ""),
      summary: String(obj.summary || ""),
      reasoning: String(obj.reasoning || ""),
      bestEvidenceFrameIndex: best,
      evidenceFrameIndices: evidence,
      severity: ["low", "medium", "high"].includes(obj.severity) ? obj.severity : "medium",
      violatedRules,
    };
  } catch {
    return emptyResult(`Failed to parse JSON from model output: ${raw.slice(0, 200)}`);
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

// ---- Interactive video inspection (user-defined questions) ----

export async function inspectVideoFrames({
  framePaths,
  userQuestion,
  videoLabel,
  history,
}: {
  framePaths: string[];
  userQuestion: string;
  videoLabel?: string;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  if (framePaths.length === 0) {
    return "No frames were extracted from the video. Try recording or uploading again.";
  }

  const imageBlocks = await Promise.all(framePaths.map(fileToImageBlock));
  const content: Anthropic.ContentBlockParam[] = [];
  imageBlocks.forEach((img, i) => {
    content.push({ type: "text", text: `Frame ${i}:` });
    content.push(img);
  });
  const label = videoLabel ? `Video: "${videoLabel}"\n\n` : "";
  content.push({
    type: "text",
    text: `${label}End of frames.\n\nUser question:\n${userQuestion}`,
  });

  const locale = await getServerLocale();
  const lang =
    locale === "ar"
      ? "\n\nReply in ARABIC (العربية) unless the user wrote in English."
      : "\n\nReply in ENGLISH unless the user wrote in Arabic.";

  const settings = getAppSettings();
  const system = [
    getVideoInspectPrompt(),
    settings.storeContext?.trim()
      ? `=== Extra context from the user ===\n${settings.storeContext.trim()}`
      : "",
    lang,
  ]
    .filter(Boolean)
    .join("\n\n");

  const prior = history
    .slice(-6)
    .filter((m) => m.content.trim())
    .map(
      (m) =>
        ({
          role: m.role,
          content: m.content,
        }) as Anthropic.MessageParam
    );

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [...prior, { role: "user", content }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// ---- Chat over reports (RAG-lite: include report metadata in the prompt) ----

export async function chatWithReports({
  userMessage,
  reports,
  history,
}: {
  userMessage: string;
  reports: ViolationReport[];
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  const reportSummary =
    reports.length === 0
      ? "(No violation reports yet.)"
      : reports
          .slice(0, 50)
          .map(
            (r, i) =>
              `#${i + 1} [${r.id}] camera="${r.streamName}" detectedAt=${new Date(
                r.detectedAt
              ).toISOString()} severity=${r.severity} confidence=${r.confidence.toFixed(
                2
              )} cashier="${r.cashierDescription}" customer="${r.customerDescription}"\n  summary: ${r.summary}`
          )
          .join("\n");

  const settings = getAppSettings();
  const activePresets = settings.activePresets
    .map((id) => COMPLIANCE_PRESETS.find((p) => p.id === id))
    .filter((p): p is (typeof COMPLIANCE_PRESETS)[number] => !!p);
  const rulesBlock =
    activePresets.length === 0
      ? "(No compliance rules are currently active. The analyzer is idle.)"
      : activePresets
          .map((p, i) => `${i + 1}. ${p.label} — ${p.rule}`)
          .join("\n");
  const inactivePresets = COMPLIANCE_PRESETS.filter(
    (p) => !settings.activePresets.includes(p.id)
  );
  const inactiveBlock =
    inactivePresets.length === 0
      ? ""
      : `\n\n=== Available but NOT enabled rules ===\n${inactivePresets
          .map((p) => `- ${p.label} (id: ${p.id}): ${p.description}`)
          .join("\n")}`;

  const locale = await getServerLocale();
  const chatLangDirective =
    locale === "ar"
      ? "\n\n=== CRITICAL: Reply language ===\nReply to the user in ARABIC (العربية). Use clear, professional Arabic. Keep proper nouns, brand names, file names, and IDs in their original form."
      : "\n\n=== CRITICAL: Reply language ===\nReply to the user in ENGLISH.";

  const systemContext = `${settings.chatPrompt}

=== Active compliance rules (${activePresets.length}) ===
${rulesBlock}${inactiveBlock}

=== Recent violation reports (${reports.length}) ===
${reportSummary}${chatLangDirective}`;

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemContext,
    messages,
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

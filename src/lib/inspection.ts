import type {
  EvidenceRef,
  FlatFrameRef,
  InspectionFinding,
  InspectionVerdict,
  VideoInspectionReport,
} from "./types";
import { evidenceRefToFlatIndex } from "./video-batch";

const VERDICTS: InspectionVerdict[] = ["yes", "no", "unclear", "n/a"];

export function inspectionToMarkdown(r: VideoInspectionReport): string {
  const lines: string[] = [
    `### ${r.title}`,
    "",
    `**${r.verdictLabel}** · ${Math.round(r.confidence * 100)}% confidence`,
    "",
    r.summary,
  ];
  if (r.videos && r.videos.length > 0) {
    lines.push("", "#### Videos analyzed");
    for (let i = 0; i < r.videos.length; i++) {
      const v = r.videos[i];
      lines.push(`- Video ${i}: **${v.name}** (${formatDur(v.durationSeconds)}, ${v.frameCount} samples)`);
    }
  }
  if (r.findings.length > 0) {
    lines.push("", "#### Findings");
    for (const f of r.findings) {
      const cite = formatFindingCite(f, r.frameLabels);
      lines.push(`- **${f.heading}** — ${f.detail}${cite}`);
    }
  }
  if (r.limitations.trim()) {
    lines.push("", "#### Limitations", r.limitations);
  }
  lines.push("", "#### Conclusion", r.conclusion);
  return lines.join("\n");
}

function formatDur(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(sec)}s`;
}

function formatFindingCite(f: InspectionFinding, labels?: string[]): string {
  if (f.evidenceRefs && f.evidenceRefs.length > 0) {
    return ` _(${f.evidenceRefs
      .map((e) => `V${e.videoIndex + 1} frame ${e.frameIndex}`)
      .join("; ")})_`;
  }
  if (f.frameIndices.length > 0 && labels) {
    return ` _(${f.frameIndices.map((i) => labels[i] || `#${i}`).join("; ")})_`;
  }
  if (f.frameIndices.length > 0) {
    return ` _(frames ${f.frameIndices.join(", ")})_`;
  }
  return "";
}

function parseEvidenceList(
  o: Record<string, unknown>,
  manifest: FlatFrameRef[]
): EvidenceRef[] {
  const raw = o.evidence ?? o.evidenceRefs ?? o.evidenceFrameIndices;
  if (!Array.isArray(raw)) return [];
  const out: EvidenceRef[] = [];
  for (const item of raw) {
    if (typeof item === "number" && Number.isInteger(item)) {
      const m = manifest[item];
      if (m) out.push({ videoIndex: m.videoIndex, frameIndex: m.frameIndex });
      continue;
    }
    if (item && typeof item === "object") {
      const r = item as Record<string, unknown>;
      const vi = Number(r.videoIndex);
      const fi = Number(r.frameIndex);
      if (Number.isInteger(vi) && Number.isInteger(fi) && vi >= 0 && fi >= 0) {
        out.push({ videoIndex: vi, frameIndex: fi });
      }
    }
  }
  return out.slice(0, 12);
}

function refsToFlatIndices(refs: EvidenceRef[], manifest: FlatFrameRef[]): number[] {
  const flat: number[] = [];
  for (const ref of refs) {
    const idx = evidenceRefToFlatIndex(manifest, ref);
    if (idx !== null && !flat.includes(idx)) flat.push(idx);
  }
  return flat;
}

export function parseInspectionJson(
  raw: string,
  meta: {
    userQuestion: string;
    videoName: string;
    framePaths: string[];
    frameLabels?: string[];
    manifest: FlatFrameRef[];
    videos?: VideoInspectionReport["videos"];
    analyzedAt?: number;
  }
): VideoInspectionReport {
  let jsonText = raw.trim();
  const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) jsonText = fence[1].trim();
  const first = jsonText.indexOf("{");
  const last = jsonText.lastIndexOf("}");
  if (first === -1 || last === -1) {
    return fallbackInspection(raw, meta);
  }
  jsonText = jsonText.slice(first, last + 1);
  try {
    const o = JSON.parse(jsonText);
    const manifest = meta.manifest;
    const frameCount = meta.framePaths.length;

    const clampFlat = (arr: unknown): number[] => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((n): n is number => Number.isInteger(n) && n >= 0 && n < frameCount)
        .slice(0, 12);
    };

    const parseFindingEvidence = (f: Record<string, unknown>): EvidenceRef[] => {
      if (Array.isArray(f.evidence)) {
        return parseEvidenceList({ evidence: f.evidence }, manifest);
      }
      return clampFlat(f.frameIndices)
        .map((flat) => manifest[flat])
        .filter((m): m is FlatFrameRef => !!m)
        .map((m) => ({ videoIndex: m.videoIndex, frameIndex: m.frameIndex }));
    };

    const findings: InspectionFinding[] = Array.isArray(o.findings)
      ? o.findings
          .slice(0, 12)
          .map((f: Record<string, unknown>) => {
            const evidenceRefs = parseFindingEvidence(f);
            return {
              heading: String(f.heading || "Observation"),
              detail: String(f.detail || ""),
              frameIndices: refsToFlatIndices(evidenceRefs, manifest),
              evidenceRefs,
            };
          })
          .filter((f: InspectionFinding) => f.detail.trim())
      : [];

    let evidenceRefs = parseEvidenceList(o, manifest);
    if (evidenceRefs.length === 0) {
      evidenceRefs = findings.flatMap((f) => f.evidenceRefs || []).slice(0, 12);
    }
    let evidenceFrameIndices = refsToFlatIndices(evidenceRefs, manifest);
    if (evidenceFrameIndices.length === 0) {
      evidenceFrameIndices = clampFlat(o.evidenceFrameIndices);
    }

    const verdict: InspectionVerdict = VERDICTS.includes(o.verdict as InspectionVerdict)
      ? (o.verdict as InspectionVerdict)
      : "unclear";
    const confidence = Math.max(0, Math.min(1, Number(o.confidence) || 0.5));

    return {
      title: String(o.title || "Multi-video analysis report"),
      userQuestion: meta.userQuestion,
      videoName: meta.videoName,
      analyzedAt: meta.analyzedAt ?? Date.now(),
      verdict,
      verdictLabel: String(o.verdictLabel || verdictLabelDefault(verdict)),
      confidence,
      summary: String(o.summary || ""),
      findings,
      evidenceFrameIndices,
      evidenceRefs,
      limitations: String(o.limitations || ""),
      conclusion: String(o.conclusion || o.summary || ""),
      framePaths: meta.framePaths,
      frameLabels: meta.frameLabels,
      videos: meta.videos,
    };
  } catch {
    return fallbackInspection(raw, meta);
  }
}

function verdictLabelDefault(v: InspectionVerdict): string {
  switch (v) {
    case "yes":
      return "Yes";
    case "no":
      return "No";
    case "unclear":
      return "Unclear";
    default:
      return "Not applicable";
  }
}

function fallbackInspection(
  raw: string,
  meta: {
    userQuestion: string;
    videoName: string;
    framePaths: string[];
    frameLabels?: string[];
    manifest: FlatFrameRef[];
    videos?: VideoInspectionReport["videos"];
    analyzedAt?: number;
  }
): VideoInspectionReport {
  return {
    title: "Video analysis report",
    userQuestion: meta.userQuestion,
    videoName: meta.videoName,
    analyzedAt: meta.analyzedAt ?? Date.now(),
    verdict: "unclear",
    verdictLabel: "See details",
    confidence: 0.5,
    summary: raw.slice(0, 500),
    findings: [],
    evidenceFrameIndices: meta.framePaths.length
      ? [Math.floor(meta.framePaths.length / 2)]
      : [],
    evidenceRefs: [],
    limitations: "Model response was not structured JSON.",
    conclusion: "",
    framePaths: meta.framePaths,
    frameLabels: meta.frameLabels,
    videos: meta.videos,
  };
}

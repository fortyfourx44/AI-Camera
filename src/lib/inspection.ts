import type {
  InspectionFinding,
  InspectionVerdict,
  VideoInspectionReport,
} from "./types";

const VERDICTS: InspectionVerdict[] = ["yes", "no", "unclear", "n/a"];

export function inspectionToMarkdown(r: VideoInspectionReport): string {
  const lines: string[] = [
    `### ${r.title}`,
    "",
    `**${r.verdictLabel}** · ${Math.round(r.confidence * 100)}% confidence`,
    "",
    r.summary,
  ];
  if (r.findings.length > 0) {
    lines.push("", "#### Findings");
    for (const f of r.findings) {
      const frames =
        f.frameIndices.length > 0
          ? ` _(frames ${f.frameIndices.join(", ")})_`
          : "";
      lines.push(`- **${f.heading}** — ${f.detail}${frames}`);
    }
  }
  if (r.limitations.trim()) {
    lines.push("", "#### Limitations", r.limitations);
  }
  lines.push("", "#### Conclusion", r.conclusion);
  return lines.join("\n");
}

export function parseInspectionJson(
  raw: string,
  meta: {
    userQuestion: string;
    videoName: string;
    framePaths: string[];
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
    const frameCount = meta.framePaths.length;
    const clampIdx = (arr: unknown): number[] => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((n): n is number => Number.isInteger(n) && n >= 0 && n < frameCount)
        .slice(0, 6);
    };
    const findings: InspectionFinding[] = Array.isArray(o.findings)
      ? o.findings
          .slice(0, 8)
          .map((f: Record<string, unknown>) => ({
            heading: String(f.heading || "Observation"),
            detail: String(f.detail || ""),
            frameIndices: clampIdx(f.frameIndices),
          }))
          .filter((f: InspectionFinding) => f.detail.trim())
      : [];

    let evidence = clampIdx(o.evidenceFrameIndices);
    if (evidence.length === 0) {
      const fromFindings = findings.flatMap((f) => f.frameIndices);
      evidence = [...new Set(fromFindings)].slice(0, 6);
    }

    const verdict: InspectionVerdict = VERDICTS.includes(o.verdict as InspectionVerdict)
      ? (o.verdict as InspectionVerdict)
      : "unclear";
    const confidence = Math.max(0, Math.min(1, Number(o.confidence) || 0.5));

    return {
      title: String(o.title || "Video analysis report"),
      userQuestion: meta.userQuestion,
      videoName: meta.videoName,
      analyzedAt: meta.analyzedAt ?? Date.now(),
      verdict,
      verdictLabel: String(o.verdictLabel || verdictLabelDefault(verdict)),
      confidence,
      summary: String(o.summary || ""),
      findings,
      evidenceFrameIndices: evidence,
      limitations: String(o.limitations || ""),
      conclusion: String(o.conclusion || o.summary || ""),
      framePaths: meta.framePaths,
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
    limitations: "Model response was not structured JSON; showing raw text below.",
    conclusion: "",
    framePaths: meta.framePaths,
  };
}

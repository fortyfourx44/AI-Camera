"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { downloadInspectionPdf } from "@/lib/generate-inspection-pdf";
import { cn } from "@/lib/utils";
import type { VideoInspectionReport } from "@/lib/types";

function screenshotUrl(relative: string): string {
  const parts = relative.replace(/\\/g, "/").split("/");
  const idx = parts.findIndex((p) => p === "screenshots");
  const sub = idx >= 0 ? parts.slice(idx + 1) : parts;
  return `/api/screenshots/${sub.map(encodeURIComponent).join("/")}`;
}

function verdictVariant(
  v: VideoInspectionReport["verdict"]
): "success" | "destructive" | "warning" | "secondary" {
  switch (v) {
    case "yes":
      return "success";
    case "no":
      return "destructive";
    case "unclear":
      return "warning";
    default:
      return "secondary";
  }
}

export function InspectionReportCard({ report }: { report: VideoInspectionReport }) {
  const t = useT();
  const [downloading, setDownloading] = React.useState(false);

  const evidenceIdx =
    report.evidenceFrameIndices.length > 0
      ? report.evidenceFrameIndices
      : report.framePaths.length
      ? [Math.floor(report.framePaths.length / 2)]
      : [];

  async function onDownloadPdf() {
    setDownloading(true);
    try {
      await downloadInspectionPdf(report, {
        reportTitle: t("inspection.reportTitle"),
        question: t("inspection.question"),
        video: t("inspection.video"),
        analyzedAt: t("inspection.analyzedAt"),
        verdict: t("inspection.verdict"),
        confidence: t("inspection.confidence"),
        summary: t("inspection.summary"),
        findings: t("inspection.findings"),
        evidence: t("inspection.evidence"),
        limitations: t("inspection.limitations"),
        conclusion: t("inspection.conclusion"),
        frame: t("inspection.frame"),
      });
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="w-full max-w-lg space-y-3 rounded-lg border bg-card p-4 text-start shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold leading-snug">{report.title}</h3>
          <p className="text-[11px] text-muted-foreground">
            {report.videoName} · {new Date(report.analyzedAt).toLocaleString()}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={downloading}
          onClick={() => void onDownloadPdf()}
          className="shrink-0"
        >
          {downloading ? (
            <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="me-1.5 h-3.5 w-3.5" />
          )}
          {t("inspection.downloadPdf")}
        </Button>
      </div>

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t("inspection.question")}:</span>{" "}
        {report.userQuestion}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={verdictVariant(report.verdict)} className="text-[10px] uppercase">
          {report.verdictLabel}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {t("inspection.confidence")}: {Math.round(report.confidence * 100)}%
        </span>
      </div>

      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("inspection.summary")}
        </h4>
        <p className="text-sm leading-relaxed">{report.summary}</p>
      </section>

      {report.findings.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("inspection.findings")}
          </h4>
          <ul className="space-y-2">
            {report.findings.map((f, i) => (
              <li
                key={`${f.heading}-${i}`}
                className="rounded-md border border-border/60 bg-background/50 px-3 py-2 text-sm"
              >
                <p className="font-medium">{f.heading}</p>
                <p className="mt-0.5 text-muted-foreground">{f.detail}</p>
                {f.frameIndices.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {t("inspection.frame")} {f.frameIndices.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evidenceIdx.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("inspection.evidence")}
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {evidenceIdx.map((idx) => {
              const rel = report.framePaths[idx];
              if (!rel) return null;
              return (
                <a
                  key={`${rel}-${idx}`}
                  href={screenshotUrl(rel)}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "group relative overflow-hidden rounded-md border ring-2 ring-primary/30"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshotUrl(rel)}
                    alt={`${t("inspection.frame")} ${idx}`}
                    className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                  <span className="absolute start-1.5 top-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    #{idx}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {report.limitations.trim() && (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("inspection.limitations")}
          </h4>
          <p className="text-xs leading-relaxed text-muted-foreground">{report.limitations}</p>
        </section>
      )}

      <section className="space-y-1 border-t pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("inspection.conclusion")}
        </h4>
        <p className="text-sm font-medium leading-relaxed">{report.conclusion}</p>
      </section>
    </div>
  );
}

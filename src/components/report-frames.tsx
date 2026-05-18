"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";
import type { ViolationReport } from "@/lib/types";

function screenshotUrl(p: string) {
  const parts = p.split(/[/\\]/);
  const idx = parts.findIndex((x) => x === "screenshots");
  const sub = idx >= 0 ? parts.slice(idx + 1) : parts;
  return `/api/screenshots/${sub.map(encodeURIComponent).join("/")}`;
}

export function ReportFrames({ report }: { report: ViolationReport }) {
  const t = useT();
  const [showAll, setShowAll] = React.useState(false);
  const hasEvidence = report.evidenceIndices && report.evidenceIndices.length > 0;
  const evidenceSet = new Set(report.evidenceIndices);
  const visibleIndices = showAll
    ? report.screenshots.map((_, i) => i)
    : hasEvidence
    ? report.evidenceIndices
    : [Math.floor(report.screenshots.length / 2)];

  const hiddenCount = report.screenshots.length - visibleIndices.length;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          {showAll
            ? `${t("report.allFrames")} (${report.screenshots.length})`
            : `${t("report.evidenceFrames")} (${visibleIndices.length})`}
        </h2>
        {report.screenshots.length > 0 && hasEvidence && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showAll
              ? t("report.showEvidence")
              : t("report.showAll", { n: report.screenshots.length })}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visibleIndices.map((i) => {
          const s = report.screenshots[i];
          if (!s) return null;
          const isEvidence = evidenceSet.has(i);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <a
              key={`${s}-${i}`}
              href={screenshotUrl(s)}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "group relative overflow-hidden rounded-md border",
                isEvidence && "ring-2 ring-destructive/60"
              )}
            >
              <img
                src={screenshotUrl(s)}
                alt={`Frame ${i}`}
                className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]"
              />
              <span className="absolute start-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-mono text-white">
                #{i}
              </span>
              {isEvidence && (
                <span className="absolute end-2 top-2 rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-mono text-destructive-foreground">
                  {t("report.evidenceBadge")}
                </span>
              )}
            </a>
          );
        })}
      </div>
      {!showAll && hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("report.otherFrames", { n: hiddenCount })}
        </p>
      )}
    </section>
  );
}

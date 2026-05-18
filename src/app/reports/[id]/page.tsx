import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera, Clock, ShieldAlert } from "lucide-react";

import { reportsRepo } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ReportFrames } from "@/components/report-frames";
import { ReportReasoning } from "@/components/report-reasoning";
import { ReportActions } from "@/components/report-actions";
import { formatDateTime } from "@/lib/utils";
import { getServerT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function ReportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let report: ReturnType<typeof reportsRepo.get> = null;
  try {
    report = reportsRepo.get(id);
  } catch {
    report = null;
  }
  if (!report) notFound();
  const { t } = await getServerT();

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/reports"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("nav.allReports")}
        </Link>
        <ReportActions id={report.id} />
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              report.severity === "high"
                ? "destructive"
                : report.severity === "medium"
                ? "warning"
                : "secondary"
            }
            className="uppercase"
          >
            {report.severity}
          </Badge>
          <Badge variant="outline">
            {(report.confidence * 100).toFixed(0)}% {t("report.confidence")}
          </Badge>
          <span className="text-xs text-muted-foreground">
            <Camera className="me-1 inline h-3 w-3" />
            {report.streamName}
          </span>
          <span className="text-xs text-muted-foreground">
            <Clock className="me-1 inline h-3 w-3" />
            {t("report.detected")} {formatDateTime(report.detectedAt)} ·{" "}
            {t("report.offset")} {report.videoTimestampLabel}
          </span>
        </div>
        <h1 className="flex items-start gap-2 text-xl font-semibold leading-snug">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          {report.summary}
        </h1>
        {(report.cashierDescription || report.customerDescription) && (
          <div className="text-sm text-muted-foreground">
            {report.cashierDescription && (
              <span>
                <span className="font-medium text-foreground/80">
                  {t("report.cashierLabel")}:
                </span>{" "}
                {report.cashierDescription}
              </span>
            )}
            {report.cashierDescription && report.customerDescription && (
              <span className="mx-2">·</span>
            )}
            {report.customerDescription && (
              <span>
                <span className="font-medium text-foreground/80">
                  {t("report.customerLabel")}:
                </span>{" "}
                {report.customerDescription}
              </span>
            )}
          </div>
        )}
      </header>

      <ReportFrames report={report} />

      {report.reasoning && <ReportReasoning reasoning={report.reasoning} />}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">{t("report.rawMeta")}</summary>
        <div className="mt-2 space-y-1 rounded-md border bg-muted/30 p-3 font-mono">
          <div>id: {report.id}</div>
          <div>chunk: {report.chunkPath}</div>
          <div>duration: {report.durationSeconds.toFixed(1)}s</div>
        </div>
      </details>
    </div>
  );
}

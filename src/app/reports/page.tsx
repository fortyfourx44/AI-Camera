import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";

import { reportsRepo } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { ReportRowDelete } from "@/components/report-row-delete";
import { formatDateTime } from "@/lib/utils";
import { getServerT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { t } = await getServerT();
  let reports: ReturnType<typeof reportsRepo.list> = [];
  try {
    reports = reportsRepo.list(500);
  } catch {
    reports = [];
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("nav.dashboard")}
        </Link>
        <Badge variant="outline">
          {reports.length} {t("reports.badgeTotal")}
        </Badge>
      </div>

      <div className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShieldAlert className="h-6 w-6 text-destructive" /> {t("reports.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("reports.subtitle")}</p>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t("reports.empty")}
        </div>
      ) : (
        <ul className="grid gap-3">
          {reports.map((r) => {
            const thumb = r.screenshots[0];
            const parts = thumb?.split(/[/\\]/) || [];
            const idx = parts.findIndex((p) => p === "screenshots");
            const sub = idx >= 0 ? parts.slice(idx + 1) : parts;
            const url = thumb
              ? `/api/screenshots/${sub.map(encodeURIComponent).join("/")}`
              : null;
            return (
              <li
                key={r.id}
                className="group relative flex items-stretch gap-2 rounded-lg border bg-card transition-colors hover:bg-accent/40"
              >
                <Link
                  href={`/reports/${r.id}`}
                  className="flex flex-1 gap-4 p-3"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt="Evidence frame"
                      className="h-24 w-36 shrink-0 rounded-md border object-cover"
                    />
                  ) : (
                    <div className="h-24 w-36 shrink-0 rounded-md border bg-muted" />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          r.severity === "high"
                            ? "destructive"
                            : r.severity === "medium"
                            ? "warning"
                            : "secondary"
                        }
                      >
                        {r.severity}
                      </Badge>
                      <span className="text-sm font-medium">{r.streamName}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(r.detectedAt)} · @ {r.videoTimestampLabel}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        confidence {(r.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm">{r.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("report.cashierLabel")}: {r.cashierDescription || "—"} ·{" "}
                      {t("report.customerLabel")}: {r.customerDescription || "—"}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center pr-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <ReportRowDelete id={r.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

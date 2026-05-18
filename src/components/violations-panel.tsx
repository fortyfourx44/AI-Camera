"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ImageIcon, ShieldAlert, Trash2 } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { cn, formatRelative } from "@/lib/utils";
import type { ViolationReport } from "@/lib/types";

export function ViolationsPanel() {
  const t = useT();
  const [reports, setReports] = React.useState<ViolationReport[]>([]);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/reports").then((r) => r.json());
    setReports(res.reports || []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const [deleting, setDeleting] = React.useState<string | null>(null);
  async function handleDelete(id: string) {
    if (!confirm(t("violations.deleteConfirm"))) return;
    setDeleting(id);
    try {
      await fetch(`/api/reports/${id}`, { method: "DELETE" });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShieldAlert className="h-4 w-4 text-destructive" /> {t("violations.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("violations.subtitle")}</p>
        </div>
        <Badge variant="outline" className="text-xs">
          {reports.length} {t("violations.total")}
        </Badge>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">
            {t("cameras.loading")}
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-40" />
            <div>{t("violations.empty")}</div>
          </div>
        ) : (
          <ul className="divide-y">
            {reports.map((r) => (
              <li key={r.id} className="group relative">
                <Link
                  href={`/reports/${r.id}`}
                  className="flex gap-3 p-3 pr-10 transition-colors hover:bg-accent/50"
                >
                  <Thumbnail src={r.screenshots[0]} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={r.severity} />
                      <span className="truncate text-xs text-muted-foreground">
                        {r.streamName} · {formatRelative(r.detectedAt)}
                      </span>
                    </div>
                    <div className="line-clamp-2 text-sm font-medium">{r.summary}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("violations.cashier")}: {r.cashierDescription || "—"}
                    </div>
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleDelete(r.id)}
                  disabled={deleting === r.id}
                  title="Delete violation"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function Thumbnail({ src }: { src?: string }) {
  if (!src) {
    return (
      <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md border bg-muted">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  // src looks like "screenshots/<streamId>/<file>.jpg"
  const parts = src.split(/[/\\]/);
  const idx = parts.findIndex((p) => p === "screenshots");
  const sub = idx >= 0 ? parts.slice(idx + 1) : parts;
  const url = `/api/screenshots/${sub.map(encodeURIComponent).join("/")}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Evidence frame"
      className="h-16 w-24 shrink-0 rounded-md border object-cover"
    />
  );
}

function SeverityBadge({ severity }: { severity: ViolationReport["severity"] }) {
  const variant =
    severity === "high" ? "destructive" : severity === "medium" ? "warning" : "secondary";
  return (
    <Badge
      variant={variant}
      className={cn("h-5 px-1.5 text-[10px] uppercase tracking-wide")}
    >
      {severity}
    </Badge>
  );
}

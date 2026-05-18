"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n-provider";

interface SystemStatus {
  ffmpeg: boolean;
  claude: boolean;
  model: string;
  streams: number;
  reports: number;
  serverless?: boolean;
  database?: boolean;
  databaseError?: string | null;
}

export function SystemStatusBanner() {
  const t = useT();
  const [status, setStatus] = React.useState<SystemStatus | null>(null);

  React.useEffect(() => {
    fetch("/api/system")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status) return null;

  const onServerless = !!status.serverless;
  const dbOk = status.database !== false;
  const ok = status.claude && dbOk;

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        ok
          ? "border-success/30 bg-success/10 text-success-foreground"
          : "border-warning/40 bg-warning/10 text-warning-foreground"
      )}
    >
      <div className="flex items-start gap-2">
        {ok ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
        )}
        <div className="flex-1 space-y-1 text-foreground/90">
          {ok ? (
            <p>
              {t("system.ready")} {t("system.model")}:{" "}
              <code className="text-xs">{status.model}</code> · {status.streams}{" "}
              {t("system.streams")} · {status.reports} {t("system.violations")}{" "}
              {t("system.logged")}.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {!status.claude && <li>{t("system.claudeMissing")}</li>}
              {!dbOk && (
                <li>
                  {t("system.databaseError")}
                  {status.databaseError ? (
                    <span className="ms-1 font-mono text-xs opacity-80">
                      ({status.databaseError})
                    </span>
                  ) : null}
                </li>
              )}
              {onServerless && <li>{t("system.serverlessWarning")}</li>}
              {!onServerless && !status.ffmpeg && (
                <li>{t("system.ffmpegMissing")}</li>
              )}
              {onServerless && status.claude && dbOk && (
                <li className="text-xs opacity-90">{t("video.subtitle")}</li>
              )}
            </ul>
          )}
          {onServerless && status.claude && dbOk && (
            <p className="text-xs opacity-90">
              {t("system.model")}:{" "}
              <code className="text-xs">{status.model}</code> · {status.streams}{" "}
              {t("system.streams")} · {status.reports} {t("system.violations")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

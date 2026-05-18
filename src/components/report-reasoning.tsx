"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { useT } from "@/components/i18n-provider";

export function ReportReasoning({ reasoning }: { reasoning: string }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        )}
        {t("report.reasoning")}
      </button>
      {open && (
        <div className="mt-2 whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed text-foreground/90">
          {reasoning}
        </div>
      )}
    </section>
  );
}

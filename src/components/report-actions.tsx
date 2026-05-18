"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";

export function ReportActions({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!confirm(t("report.deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/reports");
        router.refresh();
      } else {
        alert(t("report.deleteFailed"));
        setDeleting(false);
      }
    } catch {
      alert(t("report.deleteFailed"));
      setDeleting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={deleting}
      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      {deleting ? (
        <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="me-1.5 h-4 w-4" />
      )}
      {deleting ? t("report.deleting") : t("report.delete")}
    </Button>
  );
}

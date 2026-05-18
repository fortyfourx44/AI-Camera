import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";

import { SettingsEditor } from "@/components/settings-editor";
import { getServerT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t } = await getServerT();
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("nav.dashboard")}
      </Link>

      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Settings className="h-6 w-6" /> {t("settings.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </header>

      <SettingsEditor />
    </div>
  );
}

import Link from "next/link";
import { Eye, Settings } from "lucide-react";

import { DashboardShell } from "@/components/dashboard-shell";
import { LanguageToggle } from "@/components/language-toggle";
import { getServerT } from "@/lib/i18n-server";

export default async function DashboardPage() {
  const { t } = await getServerT();
  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <header className="shrink-0 border-b bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Eye className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-tight sm:text-lg">
                {t("app.title")}
              </h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {t("app.tagline")}
              </p>
            </div>
          </div>
          <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <LanguageToggle />
            <Link
              href="/settings"
              title={t("nav.settings")}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:px-3"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden md:inline">{t("nav.settings")}</span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-3 sm:p-4 lg:min-h-0 lg:overflow-hidden lg:p-6">
        <DashboardShell />
      </main>
    </div>
  );
}

import Link from "next/link";
import { Eye, FileText, Settings } from "lucide-react";

import { ChatPanel } from "@/components/chat-panel";
import { StreamsPanel } from "@/components/streams-panel";
import { SystemStatusBanner } from "@/components/system-status-banner";
import { ViolationsPanel } from "@/components/violations-panel";
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
              href="/reports"
              title={t("nav.reports")}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:px-3"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden md:inline">{t("nav.reports")}</span>
            </Link>
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
        <div className="shrink-0">
          <SystemStatusBanner />
        </div>
        <div className="grid flex-1 grid-cols-1 gap-4 lg:min-h-0 lg:grid-cols-12 lg:gap-6">
          <section className="space-y-6 lg:col-span-3 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pe-1">
            <StreamsPanel />
          </section>

          <section className="overflow-hidden rounded-xl border bg-card lg:col-span-5 lg:h-full lg:min-h-0">
            <ChatPanel />
          </section>

          <section className="overflow-hidden rounded-xl border bg-card lg:col-span-4 lg:h-full lg:min-h-0">
            <ViolationsPanel />
          </section>
        </div>
      </main>
    </div>
  );
}

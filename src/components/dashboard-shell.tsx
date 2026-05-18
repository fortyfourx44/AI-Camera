"use client";

import * as React from "react";

import { ChatPanel } from "@/components/chat-panel";
import { SystemStatusBanner } from "@/components/system-status-banner";
import { VideoWorkspace } from "@/components/video-workspace";
import type { VideoSession } from "@/lib/types";

export function DashboardShell() {
  const [session, setSession] = React.useState<VideoSession | null>(null);

  React.useEffect(() => {
    fetch("/api/video/session")
      .then((r) => r.json())
      .then((d) => setSession(d.session ?? null))
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="shrink-0">
        <SystemStatusBanner />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-4 lg:min-h-0 lg:grid-cols-12 lg:gap-6">
        <section className="lg:col-span-5 lg:h-full lg:min-h-[420px]">
          <VideoWorkspace session={session} onSessionChange={setSession} />
        </section>
        <section className="overflow-hidden rounded-xl border bg-card lg:col-span-7 lg:h-full lg:min-h-[420px]">
          <ChatPanel session={session} onSessionChange={setSession} />
        </section>
      </div>
    </>
  );
}

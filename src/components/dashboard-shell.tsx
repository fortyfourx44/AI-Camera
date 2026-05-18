"use client";

import * as React from "react";

import { ChatPanel } from "@/components/chat-panel";
import { SystemStatusBanner } from "@/components/system-status-banner";
import { VideoWorkspace } from "@/components/video-workspace";
import type { VideoBatch } from "@/lib/types";

export function DashboardShell() {
  const [batch, setBatch] = React.useState<VideoBatch | null>(null);

  React.useEffect(() => {
    fetch("/api/video/batch")
      .then((r) => r.json())
      .then((d) => setBatch(d.batch ?? null))
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="shrink-0">
        <SystemStatusBanner />
      </div>
      <div className="grid flex-1 grid-cols-1 gap-4 lg:min-h-0 lg:grid-cols-12 lg:gap-6">
        <section className="lg:col-span-5 lg:h-full lg:min-h-[420px]">
          <VideoWorkspace batch={batch} onBatchChange={setBatch} />
        </section>
        <section className="overflow-hidden rounded-xl border bg-card lg:col-span-7 lg:h-full lg:min-h-[420px]">
          <ChatPanel batch={batch} onBatchChange={setBatch} />
        </section>
      </div>
    </>
  );
}

"use client";

import * as React from "react";
import {
  Bot,
  FileText,
  Loader2,
  Paperclip,
  Sparkles,
  Trash2,
  User,
  Video,
} from "lucide-react";

import { AdvancedChatInput, type FileAttachment } from "@/components/ui/advanced-ai-chat-input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/components/i18n-provider";
import { cn, formatDateTime } from "@/lib/utils";
import { InspectionReportCard } from "@/components/inspection-report-card";
import { batchSummaryLabel } from "@/lib/video-format";
import type { ChatMessage, VideoBatch } from "@/lib/types";

interface LocalChatMessage extends ChatMessage {
  uploadSummary?: UploadSummary;
  inspection?: ChatMessage["inspection"];
}

interface UploadOutcome {
  chunkIndex: number;
  videoTimestampLabel: string;
  hasTransaction: boolean;
  receiptHandedToCustomer: boolean | null;
  summary: string;
  reasoning: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  reportId?: string;
  screenshots: string[];
  evidenceIndices: number[];
}

interface UploadSummary {
  chunksProcessed: number;
  violations: number;
  totalSeconds: number;
  videoStartTime?: string;
  videoStartTimeSource?: "filename" | "metadata" | "mtime" | "fallback" | "user";
  outcomes: UploadOutcome[];
  reports: string[];
}

/** Parse a filename like "20260419145722660.mp4" into a Date, client-side. */
function clientParseFilenameTimestamp(name: string): Date | null {
  const m = name.match(/(\d{14})(\d{0,3})?/);
  if (m) {
    const b = m[1];
    const Y = +b.slice(0, 4);
    const M = +b.slice(4, 6);
    const D = +b.slice(6, 8);
    const h = +b.slice(8, 10);
    const mm = +b.slice(10, 12);
    const s = +b.slice(12, 14);
    if (
      Y >= 2000 &&
      Y <= 2100 &&
      M >= 1 &&
      M <= 12 &&
      D >= 1 &&
      D <= 31 &&
      h <= 23 &&
      mm <= 59 &&
      s <= 59
    ) {
      const ms = m[2] ? +m[2].padEnd(3, "0").slice(0, 3) : 0;
      return new Date(Y, M - 1, D, h, mm, s, ms);
    }
  }
  const d = name.match(
    /(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})[-_T ]?(\d{2})[-_:.]?(\d{2})[-_:.]?(\d{2})/
  );
  if (d) {
    const [, Y, M, D, h, mm, s] = d.map((x) => +x);
    if (Y >= 2000 && M >= 1 && M <= 12 && D >= 1 && D <= 31 && h <= 23 && mm <= 59 && s <= 59)
      return new Date(Y, M - 1, D, h, mm, s);
  }
  return null;
}

/** Convert a Date into the "YYYY-MM-DDTHH:MM" format the <input type="datetime-local"> expects (LOCAL time). */
function dateToLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function screenshotUrl(relative: string): string {
  const parts = relative.split(/[/\\]/);
  const idx = parts.findIndex((p) => p === "screenshots");
  const sub = idx >= 0 ? parts.slice(idx + 1) : parts;
  return `/api/screenshots/${sub.map(encodeURIComponent).join("/")}`;
}

/**
 * Minimal safe inline-markdown renderer for chat bubbles.
 * Handles **bold**, *italic*, `code`, and auto-linkifies URLs.
 * No HTML parsing — we always emit plain React text nodes.
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*[^*\s][^*\n]*\*|https?:\/\/\S+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**") && tok.endsWith("**")) {
      nodes.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`") && tok.endsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10"
        >
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("*") && tok.endsWith("*")) {
      nodes.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    } else if (/^https?:\/\//.test(tok)) {
      nodes.push(
        <a
          key={key++}
          href={tok}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {tok}
        </a>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Block-level renderer: headers, bullets, dividers, paragraphs. */
function MarkdownText({ children }: { children: string }) {
  const lines = children.split("\n");
  const out: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (/^###\s+/.test(line)) {
      out.push(
        <div key={i} className="mb-1 mt-2 text-sm font-semibold">
          {renderInlineMarkdown(line.replace(/^###\s+/, ""))}
        </div>
      );
    } else if (/^##\s+/.test(line)) {
      out.push(
        <div key={i} className="mb-1 mt-2 text-base font-semibold">
          {renderInlineMarkdown(line.replace(/^##\s+/, ""))}
        </div>
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      out.push(
        <div key={i} className="ms-4">
          • {renderInlineMarkdown(line.replace(/^\s*[-*]\s+/, ""))}
        </div>
      );
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const match = line.match(/^\s*(\d+)\.\s+(.*)$/);
      out.push(
        <div key={i} className="ms-4">
          {match?.[1]}. {renderInlineMarkdown(match?.[2] ?? line)}
        </div>
      );
    } else if (/^---+$/.test(line.trim())) {
      out.push(<hr key={i} className="my-2 border-border/50" />);
    } else if (line.trim() === "") {
      out.push(<div key={i} className="h-2" />);
    } else {
      out.push(<div key={i}>{renderInlineMarkdown(line)}</div>);
    }
  });
  return <>{out}</>;
}

export function ChatPanel({
  batch,
  onBatchChange,
}: {
  batch: VideoBatch | null;
  onBatchChange: (b: VideoBatch | null) => void;
}) {
  const t = useT();
  const SUGGESTIONS = [
    t("chat.suggestion1"),
    t("chat.suggestion2"),
    t("chat.suggestion3"),
    t("chat.suggestion4"),
  ];
  const [messages, setMessages] = React.useState<LocalChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [files, setFiles] = React.useState<FileAttachment[]>([]);
  const [sending, setSending] = React.useState(false);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => {
        setMessages(d.messages || []);
        if (d.batch) onBatchChange(d.batch);
      })
      .catch(() => {});
  }, [onBatchChange]);

  React.useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  function removeFile(id: string | number) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function send() {
    const text = input.trim();
    if (!text) return;

    if (!batch || batch.videos.length === 0) {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: t("chat.needVideo"),
          createdAt: Date.now(),
        },
      ]);
      return;
    }

    setSending(true);
    const localUser: LocalChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    setMessages((m) => [...m, localUser]);
    setInput("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (data.batch) onBatchChange(data.batch);
      if (data.assistant) {
        setMessages((m) => [...m.filter((x) => x.id !== localUser.id), data.user, data.assistant]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.error || "No response from Claude.",
            createdAt: Date.now(),
          },
        ]);
      }
    } finally {
      setSending(false);
    }
  }

  async function clearChat() {
    if (!confirm(t("chat.clearConfirm"))) return;
    await fetch("/api/chat", { method: "DELETE" });
    setMessages([]);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> {t("chat.title")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("chat.subtitle")}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearChat}
            title={t("chat.clear")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {batch && batch.videos.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("chat.batchReady")}:{" "}
            <span className="font-medium text-foreground">{batchSummaryLabel(batch)}</span>
          </p>
        ) : (
          <p className="text-xs text-warning">{t("chat.needVideo")}</p>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollerRef} className="space-y-4 p-4">
          {messages.length === 0 && (
            <EmptyChat
              suggestions={SUGGESTIONS}
              onPick={(text) => setInput(text)}
            />
          )}
          {messages.map((m) => (
            <Message key={m.id} message={m} />
          ))}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("chat.thinking")}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t bg-background/40 p-4">
        <AdvancedChatInput
          isSending={sending}
          files={files}
          onFileRemove={removeFile}
          onSend={send}
          actionIcons={[]}
          textareaProps={{
            value: input,
            placeholder: t("chat.placeholder"),
            onChange: (e) => setInput(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            },
          }}
        />
      </div>
    </div>
  );
}

function EmptyChat({
  onPick,
  suggestions,
}: {
  onPick: (s: string) => void;
  suggestions: string[];
}) {
  const t = useT();
  return (
    <div className="space-y-4 py-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="h-6 w-6" />
      </div>
      <div>
        <h3 className="text-base font-semibold">{t("chat.welcomeTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("chat.welcomeBody")}</p>
      </div>
      <div className="mx-auto flex max-w-md flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({ message }: { message: LocalChatMessage }) {
  const t = useT();
  const isUser = message.role === "user";
  const summary = message.uploadSummary;
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "max-w-[95%] space-y-2 sm:max-w-[90%]",
          isUser && "items-end text-right"
        )}
      >
        {isUser || !message.inspection ? (
          <div
            className={cn(
              "inline-block rounded-2xl px-4 py-2 text-sm leading-relaxed",
              "whitespace-normal break-words [&_strong]:font-semibold",
              isUser
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-muted text-foreground"
            )}
          >
            <MarkdownText>{message.content}</MarkdownText>
          </div>
        ) : null}

        {message.inspection && <InspectionReportCard report={message.inspection} />}

        {summary && <UploadSummaryCard summary={summary} />}

        <div className="flex items-center gap-2 px-1">
          <Badge variant="outline" className="h-4 px-1 text-[10px] uppercase tracking-wide">
            {isUser ? t("chat.you") : t("chat.claude")}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            {formatDateTime(message.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

function UploadSummaryCard({ summary }: { summary: UploadSummary }) {
  const t = useT();
  if (!summary.outcomes?.length) return null;
  return (
    <div className="space-y-2">
      {summary.outcomes.map((o) => (
        <ChunkCard key={o.chunkIndex} outcome={o} />
      ))}
      {summary.violations === 0 && summary.chunksProcessed > 0 && (
        <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("chat.noViolationsHint")}
        </div>
      )}
    </div>
  );
}

function ChunkCard({ outcome: o }: { outcome: UploadOutcome }) {
  const t = useT();
  const [expanded, setExpanded] = React.useState(false);
  const verdict =
    !o.hasTransaction
      ? { label: t("chat.verdictNoActivity"), variant: "outline" as const }
      : o.receiptHandedToCustomer === true
      ? { label: t("chat.verdictCompliant"), variant: "success" as const }
      : o.receiptHandedToCustomer === false
      ? { label: t("chat.verdictViolation"), variant: "destructive" as const }
      : { label: t("chat.verdictUncertain"), variant: "warning" as const };
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={verdict.variant} className="h-5 px-1.5 text-[10px] uppercase">
            {verdict.label}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">
            @ {o.videoTimestampLabel}
          </span>
          <span className="text-xs text-muted-foreground">
            {Math.round(o.confidence * 100)}% conf
          </span>
        </div>
        {o.reportId && (
          <a
            className="text-xs text-primary underline-offset-4 hover:underline"
            href={`/reports/${o.reportId}`}
          >
            {t("chat.openReport")}
          </a>
        )}
      </div>
      <p className="mt-1.5 text-sm">{o.summary}</p>
      <ChunkFrames
        screenshots={o.screenshots}
        evidenceIndices={o.evidenceIndices}
      />
      {o.reasoning && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? t("chat.hideReasoning") : t("chat.showReasoning")}
          </button>
          {expanded && (
            <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs">
              {o.reasoning}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChunkFrames({
  screenshots,
  evidenceIndices,
}: {
  screenshots: string[];
  evidenceIndices: number[];
}) {
  const t = useT();
  const [showAll, setShowAll] = React.useState(false);
  if (screenshots.length === 0) return null;
  const hasEvidence = evidenceIndices.length > 0;
  const indicesToShow = showAll
    ? screenshots.map((_, i) => i)
    : hasEvidence
    ? evidenceIndices
    : [Math.floor(screenshots.length / 2)];
  return (
    <>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {indicesToShow.map((i) => {
          const s = screenshots[i];
          if (!s) return null;
          const isEvidence = evidenceIndices.includes(i);
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <a
              key={`${s}-${i}`}
              href={screenshotUrl(s)}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "group relative block overflow-hidden rounded-md border",
                isEvidence && "ring-2 ring-destructive/60"
              )}
            >
              <img
                src={screenshotUrl(s)}
                alt={`frame ${i}`}
                className="aspect-video w-full object-cover transition-transform group-hover:scale-105"
              />
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] font-mono text-white">
                #{i}
              </span>
              {isEvidence && (
                <span className="absolute end-1 top-1 rounded bg-destructive/90 px-1 text-[9px] font-mono text-white">
                  {t("chat.evidence")}
                </span>
              )}
            </a>
          );
        })}
      </div>
      {screenshots.length > indicesToShow.length && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("chat.showAll", { n: screenshots.length })}
        </button>
      )}
      {showAll && (
        <button
          onClick={() => setShowAll(false)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("chat.showEvidence")}
        </button>
      )}
    </>
  );
}


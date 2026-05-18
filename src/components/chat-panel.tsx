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
import type { ChatMessage } from "@/lib/types";

interface LocalChatMessage extends ChatMessage {
  uploadSummary?: UploadSummary;
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

export function ChatPanel() {
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
  const [pendingVideo, setPendingVideo] = React.useState<File | null>(null);
  const [videoStartTime, setVideoStartTime] = React.useState<string>(""); // local-input format
  const [videoStartSource, setVideoStartSource] = React.useState<string>("");
  const [sending, setSending] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [activeRules, setActiveRules] = React.useState<
    { id: string; label: string }[]
  >([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => {});
    const loadRules = () =>
      fetch("/api/system")
        .then((r) => r.json())
        .then((d) => setActiveRules(d.activeRules || []))
        .catch(() => {});
    loadRules();
    const id = setInterval(loadRules, 5000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending, uploading]);

  function handlePickVideo() {
    fileInputRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingVideo(f);
    setFiles([
      {
        id: f.name,
        name: f.name,
        icon: <Video className="h-4 w-4 text-primary" />,
      },
    ]);
    // Auto-detect the video's recording time from the filename; otherwise
    // leave it blank so the user can fill it in.
    const detected = clientParseFilenameTimestamp(f.name);
    if (detected) {
      setVideoStartTime(dateToLocalInputValue(detected));
      setVideoStartSource("filename");
    } else if (f.lastModified) {
      setVideoStartTime(dateToLocalInputValue(new Date(f.lastModified)));
      setVideoStartSource("mtime");
    } else {
      setVideoStartTime("");
      setVideoStartSource("");
    }
    e.target.value = "";
  }

  function removeFile(id: string | number) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (id === pendingVideo?.name) {
      setPendingVideo(null);
      setVideoStartTime("");
      setVideoStartSource("");
    }
  }

  async function send() {
    const text = input.trim();
    const hasVideo = !!pendingVideo;
    if (!text && !hasVideo) return;

    if (hasVideo && pendingVideo) {
      setUploading(true);
      const localMsg: LocalChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text || `Analyze this video: ${pendingVideo.name}`,
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, localMsg]);
      setInput("");
      setFiles([]);
      const videoToSend = pendingVideo;
      const startTimeToSend = videoStartTime;
      setPendingVideo(null);
      setVideoStartTime("");
      setVideoStartSource("");
      try {
        const fd = new FormData();
        fd.append("file", videoToSend);
        fd.append("name", videoToSend.name);
        if (startTimeToSend) {
          // Convert local datetime to ISO (server will receive as UTC).
          const iso = new Date(startTimeToSend).toISOString();
          fd.append("videoStartTime", iso);
        }
        const res = await fetch("/api/analyze-upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setMessages((m) => [
            ...m,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `${t("chat.uploadError")}: ${data.error || "unknown error"}`,
              createdAt: Date.now(),
            },
          ]);
        } else {
          const duration = `${Math.max(1, Math.round(data.totalSeconds / 60))} min`;
          const recordedLine = data.videoStartTime
            ? `\n${t("chat.uploadAckRecordedAt")}: ${new Date(
                data.videoStartTime
              ).toLocaleString()}`
            : "";
          const ack: LocalChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `${t("chat.uploadAckDone")} **${videoToSend.name}**. ${t(
              "chat.uploadAckProcessed"
            )} **${data.chunksProcessed}** ${t("chat.uploadAckChunks")} (~${duration}). ${t(
              "chat.uploadAckViolations"
            )} **${data.violations}**.${recordedLine}`,
            createdAt: Date.now(),
            uploadSummary: data,
          };
          setMessages((m) => [...m, ack]);
        }
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setUploading(false);
      }
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
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("chat.watching")}
          </span>
          {activeRules.length === 0 ? (
            <a href="/settings" className="text-xs text-warning hover:underline">
              {t("chat.noRules")}
            </a>
          ) : (
            activeRules.map((r) => (
              <Badge key={r.id} variant="secondary" className="h-5 text-[10px]">
                {r.label}
              </Badge>
            ))
          )}
          <a
            href="/settings"
            className="ms-auto text-[10px] text-muted-foreground hover:text-foreground hover:underline"
          >
            {t("chat.edit")}
          </a>
        </div>
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
          {(sending || uploading) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {uploading ? t("chat.analyzing") : t("chat.thinking")}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t bg-background/40 p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onFileChosen}
        />
        {pendingVideo && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/30 p-2 text-xs">
            <label
              htmlFor="video-start-time"
              className="text-muted-foreground"
            >
              {t("chat.recordedAt")}
            </label>
            <input
              id="video-start-time"
              type="datetime-local"
              value={videoStartTime}
              onChange={(e) => {
                setVideoStartTime(e.target.value);
                setVideoStartSource("user");
              }}
              className="rounded border bg-background px-2 py-1 text-xs"
            />
            {videoStartSource && (
              <span className="text-[10px] uppercase text-muted-foreground">
                {videoStartSource === "filename"
                  ? t("chat.recordedFromFilename")
                  : videoStartSource === "mtime"
                  ? t("chat.recordedFromMtime")
                  : videoStartSource === "user"
                  ? t("chat.recordedFromUser")
                  : ""}
              </span>
            )}
          </div>
        )}
        <AdvancedChatInput
          isSending={sending || uploading}
          files={files}
          onFileRemove={removeFile}
          onSend={send}
          actionIcons={[
            <Button
              key="video"
              variant="ghost"
              size="icon"
              aria-label={t("chat.attachVideo")}
              onClick={handlePickVideo}
              title={t("chat.attachVideo")}
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </Button>,
            <Button
              key="report"
              variant="ghost"
              size="icon"
              aria-label={t("chat.reportShortcut")}
              onClick={() => setInput(t("chat.suggestion2"))}
              title={t("chat.reportShortcut")}
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
            </Button>,
          ]}
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
          "max-w-[85%] space-y-2",
          isUser && "items-end text-right"
        )}
      >
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


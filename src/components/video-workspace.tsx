"use client";

import * as React from "react";
import { Camera, Loader2, Trash2, Upload, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { extractVideoFrames } from "@/lib/extract-video-frames";
import type { VideoSession } from "@/lib/types";

function screenshotUrl(rel: string): string {
  const parts = rel.replace(/\\/g, "/").split("/");
  const idx = parts.findIndex((p) => p === "screenshots");
  const sub = idx >= 0 ? parts.slice(idx + 1) : parts;
  return `/api/screenshots/${sub.map(encodeURIComponent).join("/")}`;
}

export function VideoWorkspace({
  session,
  onSessionChange,
}: {
  session: VideoSession | null;
  onSessionChange: (s: VideoSession | null) => void;
}) {
  const t = useT();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const previewRef = React.useRef<HTMLVideoElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  async function uploadBlob(blob: Blob, name: string) {
    setUploading(true);
    try {
      const { blobs, durationSeconds } = await extractVideoFrames(blob, 12);
      const fd = new FormData();
      fd.append("name", name);
      fd.append("durationSeconds", String(durationSeconds));
      blobs.forEach((b, i) => fd.append(`frame${i}`, b, `frame-${i}.jpg`));
      const res = await fetch("/api/video/session", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onSessionChange(data.session);
    } finally {
      setUploading(false);
    }
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    void uploadBlob(f, f.name);
    e.target.value = "";
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play();
      }
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (previewRef.current) previewRef.current.srcObject = null;
        const blob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        await uploadBlob(blob, `recording-${new Date().toISOString().slice(0, 19)}.webm`);
        URL.revokeObjectURL(url);
        setPreviewUrl(null);
        setRecording(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : t("video.cameraDenied")
      );
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function clearSession() {
    await fetch("/api/video/session", { method: "DELETE" });
    onSessionChange(null);
  }

  return (
    <div className="flex h-full flex-col rounded-xl border bg-card">
      <div className="space-y-1 border-b p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Video className="h-4 w-4 text-primary" />
          {t("video.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("video.subtitle")}</p>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted/40">
          <video
            ref={previewRef}
            src={previewUrl ?? undefined}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          {!recording && !previewUrl && !session && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              {t("video.emptyPreview")}
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={onFileChosen}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || recording}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="me-1.5 h-4 w-4" />
            {t("video.upload")}
          </Button>
          {!recording ? (
            <Button
              type="button"
              size="sm"
              disabled={uploading}
              onClick={() => void startRecording()}
            >
              <Camera className="me-1.5 h-4 w-4" />
              {t("video.record")}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={stopRecording}
            >
              {t("video.stop")}
            </Button>
          )}
          {session && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void clearSession()}
            >
              <Trash2 className="me-1.5 h-4 w-4" />
              {t("video.clear")}
            </Button>
          )}
        </div>

        {session && (
          <div className="space-y-2">
            <p className="truncate text-xs font-medium">{session.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {session.framePaths.length} {t("video.framesReady")} ·{" "}
              {Math.round(session.durationSeconds)}s
            </p>
            <div className="grid grid-cols-4 gap-1">
              {session.framePaths.slice(0, 8).map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p}
                  src={screenshotUrl(p)}
                  alt={`frame ${i}`}
                  className="aspect-video rounded border object-cover"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

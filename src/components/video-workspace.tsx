"use client";

import * as React from "react";
import { Camera, CheckCircle2, Loader2, Trash2, Upload, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT } from "@/components/i18n-provider";
import { extractVideoFrames } from "@/lib/extract-video-frames";
import { formatDuration } from "@/lib/video-format";
import { MAX_VIDEOS_PER_BATCH } from "@/lib/video-batch-constants";
import type { VideoBatch } from "@/lib/types";

type QueueItem = {
  id: string;
  file: File;
  status: "queued" | "extracting" | "uploading" | "done" | "error";
  progress: number;
  statusText: string;
  error?: string;
};

export function VideoWorkspace({
  batch,
  onBatchChange,
}: {
  batch: VideoBatch | null;
  onBatchChange: (b: VideoBatch | null) => void;
}) {
  const t = useT();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [processing, setProcessing] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const previewRef = React.useRef<HTMLVideoElement>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

  const videoCount = batch?.videos.length ?? 0;
  const canAddMore = videoCount + queue.filter((q) => q.status !== "error").length < MAX_VIDEOS_PER_BATCH;

  async function processQueue(files: File[]) {
    if (files.length === 0) return;
    setProcessing(true);
    let latestBatch = batch;

    for (const file of files) {
      const itemId = crypto.randomUUID();
      setQueue((q) => [
        ...q,
        { id: itemId, file, status: "queued", progress: 0, statusText: t("video.queued") },
      ]);

      const updateItem = (patch: Partial<QueueItem>) => {
        setQueue((q) => q.map((x) => (x.id === itemId ? { ...x, ...patch } : x)));
      };

      try {
        updateItem({ status: "extracting", statusText: t("video.extracting") });
        const { blobs, durationSeconds, timestamps } = await extractVideoFrames(
          file,
          undefined,
          (pct, label) => {
            updateItem({
              progress: pct,
              statusText: label,
            });
          }
        );

        updateItem({ status: "uploading", progress: 0, statusText: t("video.uploading") });
        const fd = new FormData();
        fd.append("name", file.name);
        fd.append("durationSeconds", String(durationSeconds));
        fd.append("frameTimestamps", JSON.stringify(timestamps));
        blobs.forEach((b, i) => fd.append(`frame${i}`, b, `frame-${i}.jpg`));

        const res = await fetch("/api/video/batch", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        latestBatch = data.batch;
        onBatchChange(data.batch);
        updateItem({
          status: "done",
          progress: 100,
          statusText: `${formatDuration(durationSeconds)} · ${blobs.length} frames`,
        });
      } catch (err) {
        updateItem({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          statusText: t("video.uploadFailed"),
        });
      }
    }

    setProcessing(false);
    if (latestBatch) onBatchChange(latestBatch);
    setTimeout(() => setQueue((q) => q.filter((x) => x.status !== "done")), 4000);
  }

  function onFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    const files = Array.from(list).slice(0, MAX_VIDEOS_PER_BATCH - videoCount);
    void processQueue(files);
    e.target.value = "";
  }

  async function uploadRecording(blob: Blob, name: string) {
    const file = new File([blob], name, { type: blob.type || "video/webm" });
    await processQueue([file]);
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
        await uploadRecording(
          blob,
          `recording-${new Date().toISOString().slice(0, 19)}.webm`
        );
        URL.revokeObjectURL(url);
        setPreviewUrl(null);
        setRecording(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("video.cameraDenied"));
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  async function clearAll() {
    await fetch("/api/video/batch", { method: "DELETE" });
    onBatchChange(null);
    setQueue([]);
  }

  const totalDuration = batch?.videos.reduce((a, v) => a + v.durationSeconds, 0) ?? 0;
  const totalFrames = batch?.videos.reduce((a, v) => a + v.framePaths.length, 0) ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border bg-card">
      <div className="border-b p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Video className="h-4 w-4 text-primary" />
          {t("video.title")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("video.subtitle")}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("video.batchHint")}</p>
      </div>

      <div className="relative aspect-video shrink-0 bg-muted/30">
        <video
          ref={previewRef}
          src={previewUrl ?? undefined}
          className="h-full w-full object-contain"
          playsInline
          muted
        />
        {!recording && !previewUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {t("video.emptyPreview")}
          </div>
        )}
        {recording && (
          <div className="absolute start-3 top-3 flex items-center gap-2 rounded-full bg-destructive/90 px-2.5 py-1 text-xs font-medium text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {t("video.recording")}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b p-3">
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={onFilesChosen}
          disabled={!canAddMore || processing}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canAddMore || processing}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="me-1.5 h-3.5 w-3.5" />
          {t("video.upload")}
        </Button>
        {!recording ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAddMore || processing}
            onClick={() => void startRecording()}
          >
            <Camera className="me-1.5 h-3.5 w-3.5" />
            {t("video.record")}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="destructive" onClick={stopRecording}>
            {t("video.stop")}
          </Button>
        )}
        {(videoCount > 0 || queue.length > 0) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ms-auto text-muted-foreground"
            disabled={processing}
            onClick={() => void clearAll()}
          >
            <Trash2 className="me-1.5 h-3.5 w-3.5" />
            {t("video.clearAll")}
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3">
          {videoCount > 0 && (
            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs">
              <span className="font-medium text-foreground">
                {t("video.batchReady", { count: videoCount, max: MAX_VIDEOS_PER_BATCH })}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {formatDuration(totalDuration)} · {totalFrames} {t("video.framesReady")}
              </span>
            </div>
          )}

          {batch?.videos.map((v, i) => (
            <div
              key={v.id}
              className="flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {i + 1}. {v.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(v.durationSeconds)} · {v.framePaths.length}{" "}
                  {t("video.framesReady")}
                </p>
              </div>
            </div>
          ))}

          {queue.map((q) => (
            <div
              key={q.id}
              className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-sm"
            >
              {q.status === "error" ? (
                <span className="mt-0.5 text-xs text-destructive">!</span>
              ) : q.status === "done" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
              ) : (
                <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{q.file.name}</p>
                <p className="text-xs text-muted-foreground">{q.statusText}</p>
                {q.error && <p className="text-xs text-destructive">{q.error}</p>}
              </div>
            </div>
          ))}

          {videoCount === 0 && queue.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t("video.emptyList")}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
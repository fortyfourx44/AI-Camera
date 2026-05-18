"use client";

import * as React from "react";
import {
  Camera,
  Check,
  ChevronRight,
  CircleDot,
  Cloud,
  CloudOff,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/components/i18n-provider";
import type { MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CameraStream } from "@/lib/types";

interface BrandPreset {
  id: string;
  label: string;
  defaultPort: number;
  defaultUser: string;
  hint: string;
  /** Builds the path portion (everything after host:port) given the channel number. */
  buildPath: (ch: number, sub: boolean) => string;
}

const BRAND_PRESETS: BrandPreset[] = [
  {
    id: "hikvision",
    label: "HiLook / Hikvision NVR",
    defaultPort: 554,
    defaultUser: "admin",
    hint: "Enable RTSP at: web UI → Configuration → System → Security → Authentication.",
    buildPath: (ch, sub) =>
      `/Streaming/Channels/${String(ch).padStart(1, "0")}${sub ? "02" : "01"}`,
  },
  {
    id: "dahua",
    label: "Dahua / Lorex / Amcrest",
    defaultPort: 554,
    defaultUser: "admin",
    hint: "Most Dahua/Lorex/Amcrest cameras use this URL out of the box.",
    buildPath: (ch, sub) =>
      `/cam/realmonitor?channel=${ch}&subtype=${sub ? 1 : 0}`,
  },
  {
    id: "reolink",
    label: "Reolink",
    defaultPort: 554,
    defaultUser: "admin",
    hint: "Make sure RTSP is enabled in the Reolink app under Network → Advanced.",
    buildPath: (_ch, sub) =>
      sub ? "/h264Preview_01_sub" : "/h264Preview_01_main",
  },
  {
    id: "tplink",
    label: "TP-Link Tapo / VIGI",
    defaultPort: 554,
    defaultUser: "admin",
    hint: "In Tapo app: Account Settings → enable 3rd Party Compatibility / Tapo Camera Account.",
    buildPath: (_ch, sub) => (sub ? "/stream2" : "/stream1"),
  },
  {
    id: "axis",
    label: "Axis",
    defaultPort: 554,
    defaultUser: "root",
    hint: "Standard Axis VAPIX RTSP path.",
    buildPath: (ch) =>
      `/axis-media/media.amp?videocodec=h264&camera=${ch}`,
  },
  {
    id: "onvif",
    label: "Generic ONVIF",
    defaultPort: 554,
    defaultUser: "admin",
    hint: "Best-effort path. Use the manual tab if your ONVIF camera differs.",
    buildPath: (_ch, sub) =>
      sub ? "/onvif1?profile=Profile_2" : "/onvif1?profile=Profile_1",
  },
];

interface Props {
  onChange?: () => void;
}

function RunDurationSelect({
  id,
  value,
  onChange,
  disabled,
  labelId,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  labelId?: string;
}) {
  const t = useT();
  return (
    <select
      id={id}
      aria-labelledby={labelId}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 max-w-[9.5rem] rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
    >
      <option value={0}>{t("cameras.runDurationUnlimited")}</option>
      <option value={15}>{t("cameras.runDuration15m")}</option>
      <option value={30}>{t("cameras.runDuration30m")}</option>
      <option value={60}>{t("cameras.runDuration1h")}</option>
      <option value={120}>{t("cameras.runDuration2h")}</option>
      <option value={360}>{t("cameras.runDuration6h")}</option>
    </select>
  );
}

export function StreamsPanel({ onChange }: Props) {
  const t = useT();
  const [streams, setStreams] = React.useState<CameraStream[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/streams").then((r) => r.json());
    setStreams(res.streams || []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  async function start(id: string, durationMinutes: number) {
    setBusy(id);
    try {
      const res = await fetch(`/api/streams/${id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to start stream.");
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function stop(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/streams/${id}/stop`, { method: "POST" });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("cameras.deleteConfirm"))) return;
    setBusy(id);
    try {
      await fetch(`/api/streams/${id}`, { method: "DELETE" });
      await refresh();
      onChange?.();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Camera className="h-4 w-4" /> {t("cameras.title")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("cameras.subtitle")}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="me-1 h-4 w-4" /> {t("cameras.add")}
            </Button>
          </DialogTrigger>
          <AddCameraDialog
            onClose={() => setOpen(false)}
            onAdded={() => {
              refresh();
              onChange?.();
            }}
          />
        </Dialog>
      </div>

      <div className="space-y-2">
        {loading && (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("cameras.loading")}
          </div>
        )}
        {!loading && streams.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {t("cameras.empty")}
          </div>
        )}
        {streams.map((s) => (
          <StreamRow
            key={s.id}
            stream={s}
            busy={busy === s.id}
            onStart={(durationMinutes) => start(s.id, durationMinutes)}
            onStop={() => stop(s.id)}
            onDelete={() => remove(s.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AddCameraDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const t = useT();
  const [submitting, setSubmitting] = React.useState(false);
  const [tab, setTab] = React.useState<"preset" | "manual" | "cloud">("preset");

  // Preset state
  const [brandId, setBrandId] = React.useState(BRAND_PRESETS[0].id);
  const brand = BRAND_PRESETS.find((b) => b.id === brandId)!;
  const [host, setHost] = React.useState("192.168.1.64");
  const [port, setPort] = React.useState<number>(brand.defaultPort);
  const [user, setUser] = React.useState(brand.defaultUser);
  const [password, setPassword] = React.useState("");
  const [channel, setChannel] = React.useState<number>(1);
  const [useSubStream, setUseSubStream] = React.useState(true);
  const [presetName, setPresetName] = React.useState("Camera 1");
  const [bulk, setBulk] = React.useState(false);
  const [bulkCount, setBulkCount] = React.useState(4);
  const [bulkPrefix, setBulkPrefix] = React.useState("Camera");

  React.useEffect(() => {
    setPort(brand.defaultPort);
    setUser((u) => u || brand.defaultUser);
  }, [brand.defaultPort, brand.defaultUser, brandId]);

  // Manual state
  const [manualName, setManualName] = React.useState("");
  const [manualUrl, setManualUrl] = React.useState("");

  function buildUrl(ch: number, sub: boolean) {
    const auth =
      user && password
        ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`
        : "";
    return `rtsp://${auth}${host}:${port}${brand.buildPath(ch, sub)}`;
  }

  async function createOne(name: string, url: string) {
    const res = await fetch("/api/streams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, rtspUrl: url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed");
    }
  }

  async function submitPreset() {
    if (!host.trim() || !password.trim()) return;
    setSubmitting(true);
    try {
      if (bulk) {
        for (let ch = 1; ch <= bulkCount; ch++) {
          await createOne(`${bulkPrefix} ${ch}`, buildUrl(ch, useSubStream));
        }
      } else {
        await createOne(presetName.trim() || `Camera ${channel}`, buildUrl(channel, useSubStream));
      }
      onAdded();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitManual() {
    if (!manualName.trim() || !manualUrl.trim()) return;
    setSubmitting(true);
    try {
      await createOne(manualName.trim(), manualUrl.trim());
      onAdded();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const previewUrl = buildUrl(channel, useSubStream);
  const safePreview = previewUrl.replace(
    /:\/\/[^@]*@/,
    `://${user || "user"}:••••••@`
  );

  return (
    <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-xl">
      <DialogHeader className="shrink-0">
        <DialogTitle>{t("addCamera.title")}</DialogTitle>
        <DialogDescription>{t("addCamera.description")}</DialogDescription>
      </DialogHeader>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "preset" | "manual" | "cloud")}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="grid w-full shrink-0 grid-cols-3">
          <TabsTrigger value="preset">{t("addCamera.tabPreset")}</TabsTrigger>
          <TabsTrigger value="manual">{t("addCamera.tabManual")}</TabsTrigger>
          <TabsTrigger value="cloud">
            <Cloud className="me-1 h-3.5 w-3.5" />
            {t("addCamera.tabCloud")}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="preset"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto pe-1"
        >
          <div className="space-y-1.5">
            <Label>{t("addCamera.brand")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {BRAND_PRESETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBrandId(b.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    brandId === b.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{brand.hint}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="host">{t("addCamera.host")}</Label>
              <Input
                id="host"
                placeholder="192.168.1.64"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="port">{t("addCamera.port")}</Label>
              <Input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value || "554", 10))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user">{t("addCamera.username")}</Label>
              <Input id="user" value={user} onChange={(e) => setUser(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("addCamera.password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border bg-card/40 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={bulk}
                onChange={(e) => setBulk(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              {t("addCamera.bulk")}
            </label>

            {!bulk ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cname">{t("addCamera.displayName")}</Label>
                  <Input
                    id="cname"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ch">{t("addCamera.channel")}</Label>
                  <Input
                    id="ch"
                    type="number"
                    min={1}
                    value={channel}
                    onChange={(e) => setChannel(parseInt(e.target.value || "1", 10))}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="prefix">{t("addCamera.prefix")}</Label>
                  <Input
                    id="prefix"
                    value={bulkPrefix}
                    onChange={(e) => setBulkPrefix(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="count">{t("addCamera.count")}</Label>
                  <Input
                    id="count"
                    type="number"
                    min={1}
                    max={32}
                    value={bulkCount}
                    onChange={(e) =>
                      setBulkCount(Math.max(1, Math.min(32, parseInt(e.target.value || "1", 10))))
                    }
                  />
                </div>
              </div>
            )}

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useSubStream}
                onChange={(e) => setUseSubStream(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              {t("addCamera.useSub")}
            </label>
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("addCamera.preview")}
            </Label>
            <div className="break-all rounded-md border bg-muted/40 p-2 font-mono text-xs">
              {safePreview}
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="manual"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto pe-1"
        >
          <div className="space-y-1.5">
            <Label htmlFor="m-name">{t("addCamera.manualName")}</Label>
            <Input
              id="m-name"
              placeholder={t("addCamera.namePlaceholder")}
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-url">{t("addCamera.manualUrl")}</Label>
            <Input
              id="m-url"
              placeholder="rtsp://user:pass@192.168.1.10:554/Streaming/Channels/101"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("addCamera.manualHint")}
            </p>
          </div>
        </TabsContent>

        <TabsContent
          value="cloud"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto pe-1"
        >
          <CloudTabContent
            onImported={() => {
              onAdded();
              onClose();
            }}
          />
        </TabsContent>
      </Tabs>

      <DialogFooter className="shrink-0">
        <Button variant="ghost" onClick={onClose}>
          {t("addCamera.cancel")}
        </Button>
        {tab !== "cloud" && (
          <Button
            onClick={tab === "preset" ? submitPreset : submitManual}
            disabled={submitting}
          >
            {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {tab === "preset" && bulk
              ? t("addCamera.bulkSave", { count: bulkCount })
              : t("addCamera.save")}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

// -------------------- Hik-Connect cloud tab --------------------

interface CloudAccount {
  configured: boolean;
  email: string | null;
  lastLoginAt: number | null;
}

interface CloudCamera {
  cameraId: string;
  cameraName: string;
  channelNo: number;
  signalStatus: number;
  alreadyImported: boolean;
  hasPreview: boolean;
}

interface CloudDevice {
  deviceSerial: string;
  deviceName: string;
  deviceType: string;
  online: boolean;
  version: string;
  error: string | null;
  cameras: CloudCamera[];
}

function CloudTabContent({ onImported }: { onImported: () => void }) {
  const t = useT();
  const [account, setAccount] = React.useState<CloudAccount | null>(null);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [signingIn, setSigningIn] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [devices, setDevices] = React.useState<CloudDevice[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [quality, setQuality] = React.useState<"sub" | "main">("sub");
  const [pollIntervalSec, setPollIntervalSec] = React.useState<number>(20);
  const [runDurationMinutes, setRunDurationMinutes] = React.useState(0);
  const [importing, setImporting] = React.useState(false);
  const [importNotice, setImportNotice] = React.useState<string | null>(null);
  // Bump to force-refresh all thumbnails (cache-busts the <img src=>).
  const [thumbEpoch, setThumbEpoch] = React.useState(() => Date.now());

  const refreshAccount = React.useCallback(async () => {
    try {
      const res = await fetch("/api/hikconnect/account");
      const data = (await res.json()) as CloudAccount;
      setAccount(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  React.useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  async function signIn() {
    if (!email.trim() || !password) return;
    setSigningIn(true);
    setError(null);
    try {
      const res = await fetch("/api/hikconnect/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const kind = data?.kind as string | undefined;
        const msg =
          kind === "bad-credentials"
            ? t("addCamera.cloud.errBadCreds")
            : kind === "captcha-required"
              ? t("addCamera.cloud.errCaptcha")
              : kind === "network"
                ? t("addCamera.cloud.errNetwork")
                : t("addCamera.cloud.errGeneric", {
                    msg: data?.error ?? "unknown",
                  });
        setError(msg);
        return;
      }
      setPassword("");
      await refreshAccount();
      loadDevices();
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut() {
    await fetch("/api/hikconnect/account", { method: "DELETE" });
    setDevices(null);
    setSelected(new Set());
    setError(null);
    setImportNotice(null);
    await refreshAccount();
  }

  const loadDevices = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hikconnect/devices");
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error ??
            t("addCamera.cloud.errGeneric", { msg: "list-failed" })
        );
        return;
      }
      setDevices((data.devices as CloudDevice[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    if (account?.configured && devices === null && !loading) {
      loadDevices();
    }
  }, [account, devices, loading, loadDevices]);

  function toggleCamera(device: CloudDevice, cam: CloudCamera) {
    if (cam.alreadyImported) return;
    const k = `${device.deviceSerial}:${cam.channelNo}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function importSelected() {
    if (!devices || selected.size === 0) return;
    setImporting(true);
    setImportNotice(null);
    try {
      const selections: {
        deviceSerial: string;
        cameraId: string;
        channelNo: number;
        name: string;
        quality: "sub" | "main";
        pollIntervalSec: number;
        framesPerChunk: number;
      }[] = [];
      for (const d of devices) {
        for (const c of d.cameras) {
          const k = `${d.deviceSerial}:${c.channelNo}`;
          if (selected.has(k)) {
            selections.push({
              deviceSerial: d.deviceSerial,
              cameraId: c.cameraId,
              channelNo: c.channelNo,
              name:
                d.cameras.length > 1
                  ? `${d.deviceName} · ${c.cameraName || `Ch${c.channelNo}`}`
                  : d.deviceName,
              quality,
              pollIntervalSec,
              framesPerChunk: 12,
            });
          }
        }
      }
      const res = await fetch("/api/hikconnect/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections,
          runDurationMinutes,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const n = Array.isArray(data.imported) ? data.imported.length : 0;
        setImportNotice(t("addCamera.cloud.importSuccess", { n }));
        setSelected(new Set());
        onImported();
      } else {
        setImportNotice(
          data?.message ??
            data?.error ??
            t("addCamera.cloud.errGeneric", { msg: "import-failed" })
        );
      }
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = selected.size;

  // ----- Not configured: sign-in form -----
  if (!account || !account.configured) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Cloud className="h-4 w-4 text-primary" />
            {t("addCamera.cloud.title")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("addCamera.cloud.subtitle")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hc-email">{t("addCamera.cloud.email")}</Label>
          <Input
            id="hc-email"
            type="text"
            autoComplete="username"
            placeholder={t("addCamera.cloud.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hc-password">{t("addCamera.cloud.password")}</Label>
          <Input
            id="hc-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") signIn();
            }}
          />
        </div>
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <Button
          onClick={signIn}
          disabled={signingIn || !email.trim() || !password}
          className="w-full"
        >
          {signingIn ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t("addCamera.cloud.signingIn")}
            </>
          ) : (
            t("addCamera.cloud.signIn")
          )}
        </Button>
      </div>
    );
  }

  // ----- Configured: device list -----
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs">
            <Cloud className="h-3.5 w-3.5 text-primary" />
            <span className="text-muted-foreground">
              {t("addCamera.cloud.signedInAs")}:
            </span>
            <span className="truncate font-medium">{account.email}</span>
          </div>
          {account.lastLoginAt && (
            <div className="text-[10px] text-muted-foreground">
              {t("addCamera.cloud.lastLoginAt")}:{" "}
              {new Date(account.lastLoginAt).toLocaleString()}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              loadDevices();
              setThumbEpoch(Date.now());
            }}
            disabled={loading}
            title={t("addCamera.cloud.loadDevices")}
          >
            <RefreshCw
              className={cn("h-4 w-4", loading && "animate-spin")}
            />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            title={t("addCamera.cloud.signOut")}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-dashed bg-muted/30 p-2 text-[11px] text-muted-foreground">
        <p>{t("addCamera.cloud.m1Notice")}</p>
        <p>{t("addCamera.cloud.pastFootageNotice")}</p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {loading && !devices && (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-4 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("addCamera.cloud.loadingDevices")}
          </div>
        )}

        {devices && devices.length === 0 && !loading && (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            {t("addCamera.cloud.noDevices")}
          </div>
        )}

        {devices?.map((d) => (
          <div
            key={d.deviceSerial}
            className="overflow-hidden rounded-md border"
          >
            <div className="flex items-center gap-2 bg-muted/30 px-3 py-2">
              {d.online ? (
                <Cloud className="h-3.5 w-3.5 text-success" />
              ) : (
                <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">
                  {d.deviceName}
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {d.deviceSerial}
                  {d.deviceType ? ` · ${d.deviceType}` : ""}
                  {!d.online && ` · ${t("addCamera.cloud.deviceOffline")}`}
                </div>
              </div>
            </div>
            {d.error && (
              <div className="border-t bg-destructive/5 px-3 py-1.5 text-[10px] text-destructive">
                {d.error}
              </div>
            )}
            <div className="divide-y">
              {d.cameras.length === 0 && !d.error && (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">
                  —
                </div>
              )}
              {d.cameras.map((c) => {
                const k = `${d.deviceSerial}:${c.channelNo}`;
                const checked = selected.has(k);
                const disabled = c.alreadyImported || !d.online;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleCamera(d, c)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-start transition-colors",
                      !disabled && "hover:bg-accent/40",
                      disabled && "opacity-60"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background"
                      )}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    <CameraThumbnail
                      deviceSerial={d.deviceSerial}
                      channelNo={c.channelNo}
                      hasPreview={c.hasPreview}
                      online={d.online && c.signalStatus === 1}
                      epoch={thumbEpoch}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">
                        {c.cameraName || `${t("addCamera.cloud.channel")} ${c.channelNo}`}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {t("addCamera.cloud.channel")} {c.channelNo}
                        {c.signalStatus !== 1 &&
                          ` · ${t("addCamera.cloud.cameraOffline")}`}
                        {c.alreadyImported &&
                          ` · ${t("addCamera.cloud.alreadyImported")}`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {devices && devices.length > 0 && (
        <div className="space-y-2 rounded-md border bg-card/40 p-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="hc-poll-interval" className="text-xs">
              {t("addCamera.cloud.pollInterval")}
            </Label>
            <Input
              id="hc-poll-interval"
              type="number"
              min={5}
              max={300}
              value={pollIntervalSec}
              onChange={(e) =>
                setPollIntervalSec(
                  Math.max(5, Math.min(300, Number(e.target.value) || 20))
                )
              }
              className="h-7 w-20 text-xs"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t("addCamera.cloud.pollIntervalHint")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="hc-run-duration" className="text-xs">
              {t("addCamera.cloud.runDuration")}
            </Label>
            <RunDurationSelect
              id="hc-run-duration"
              value={runDurationMinutes}
              onChange={setRunDurationMinutes}
              disabled={importing}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t("addCamera.cloud.runDurationHint")}
          </p>
          <div className="flex items-center gap-2">
            <Label className="text-xs">
              {t("addCamera.cloud.selectQuality")}
            </Label>
            <div className="flex rounded-md border">
              <button
                type="button"
                onClick={() => setQuality("sub")}
                className={cn(
                  "px-2 py-1 text-[11px] transition-colors",
                  quality === "sub"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {t("addCamera.cloud.qualitySub")}
              </button>
              <button
                type="button"
                onClick={() => setQuality("main")}
                className={cn(
                  "px-2 py-1 text-[11px] transition-colors",
                  quality === "main"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {t("addCamera.cloud.qualityMain")}
              </button>
            </div>
          </div>
          <Button
            onClick={importSelected}
            disabled={importing || selectedCount === 0}
            className="w-full"
          >
            {importing ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t("addCamera.cloud.importingSelected")}
              </>
            ) : (
              t("addCamera.cloud.importSelected", { n: selectedCount })
            )}
          </Button>
          {selectedCount === 0 && (
            <p className="text-center text-[10px] text-muted-foreground">
              {t("addCamera.cloud.nothingSelected")}
            </p>
          )}
          {importNotice && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning-foreground">
              {importNotice}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CameraThumbnail({
  deviceSerial,
  channelNo,
  hasPreview,
  online,
  epoch,
}: {
  deviceSerial: string;
  channelNo: number;
  hasPreview: boolean;
  online: boolean;
  epoch: number;
}) {
  const [status, setStatus] = React.useState<
    "loading" | "ready" | "empty" | "error"
  >(hasPreview && online ? "loading" : "empty");

  const src = React.useMemo(() => {
    if (!hasPreview || !online) return null;
    const params = new URLSearchParams({
      deviceSerial,
      channelNo: String(channelNo),
      t: String(epoch),
    });
    return `/api/hikconnect/snapshot?${params.toString()}`;
  }, [deviceSerial, channelNo, hasPreview, online, epoch]);

  React.useEffect(() => {
    if (src) setStatus("loading");
    else setStatus("empty");
  }, [src]);

  return (
    <div
      className={cn(
        "relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40",
        !online && "opacity-50"
      )}
    >
      {src && status !== "error" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity",
            status === "ready" ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
      )}
      {status === "loading" && (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      )}
      {(status === "empty" || status === "error") && (
        <Camera className="h-3.5 w-3.5 text-muted-foreground/60" />
      )}
    </div>
  );
}

function StreamRow({
  stream,
  busy,
  onStart,
  onStop,
  onDelete,
}: {
  stream: CameraStream;
  busy: boolean;
  onStart: (durationMinutes: number) => void;
  onStop: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const isRecording = stream.status === "recording" || stream.status === "analyzing";
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border bg-card/50 p-3",
        stream.status === "error" && "border-destructive/40"
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border",
            isRecording
              ? "border-success/40 bg-success/10 text-success"
              : stream.status === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted text-muted-foreground"
          )}
        >
          {isRecording ? (
            <CircleDot className="h-4 w-4 animate-pulse-glow" />
          ) : stream.status === "error" ? (
            <WifiOff className="h-4 w-4" />
          ) : (
            <Wifi className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 truncate text-sm font-medium">
            {stream.name}
            <StatusBadge status={stream.status} />
          </div>
          {stream.sourceType === "hikconnect" ? (
            <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Cloud className="h-3 w-3 text-primary/70" />
              <Badge variant="secondary" className="h-4 px-1 text-[9px] uppercase tracking-wide">
                {t("cameras.snapshotMode")}
              </Badge>
              <span className="truncate font-mono">
                {stream.sourceConfig?.deviceSerial}·{t("addCamera.cloud.channel")}{" "}
                {stream.sourceConfig?.channelNo} · {stream.sourceConfig?.pollIntervalSec}s
              </span>
            </div>
          ) : (
            <div className="truncate font-mono text-xs text-muted-foreground">
              {stream.rtspUrl.replace(/:\/\/[^@]*@/, "://••••@")}
            </div>
          )}
          {stream.errorMessage && (
            <div className="truncate text-xs text-destructive">{stream.errorMessage}</div>
          )}
        </div>
      </div>
      <StreamRowActions
        busy={busy}
        isRecording={isRecording}
        onStart={onStart}
        onStop={onStop}
        onDelete={onDelete}
      />
    </div>
  );
}

function StreamRowActions({
  busy,
  isRecording,
  onStart,
  onStop,
  onDelete,
}: {
  busy: boolean;
  isRecording: boolean;
  onStart: (durationMinutes: number) => void;
  onStop: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [runMinutes, setRunMinutes] = React.useState<number>(0);
  const runDurLabelId = React.useId();
  const runDurSelectId = React.useId();
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {isRecording ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onStop}
          disabled={busy}
          title={t("cameras.stop")}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </Button>
      ) : (
        <>
          <span id={runDurLabelId} className="sr-only">
            {t("cameras.runDuration")}
          </span>
          <RunDurationSelect
            id={runDurSelectId}
            labelId={runDurLabelId}
            value={runMinutes}
            onChange={setRunMinutes}
            disabled={busy}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => onStart(runMinutes)}
            disabled={busy}
            title={t("cameras.start")}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t("cameras.start")
            )}
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        disabled={busy}
        title={t("cameras.delete")}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: CameraStream["status"] }) {
  const t = useT();
  const map: Record<
    CameraStream["status"],
    { variant: "secondary" | "success" | "destructive" | "warning"; key: MessageKey }
  > = {
    idle: { variant: "secondary", key: "cameras.statusIdle" },
    recording: { variant: "success", key: "cameras.statusRecording" },
    analyzing: { variant: "warning", key: "cameras.statusAnalyzing" },
    error: { variant: "destructive", key: "cameras.statusError" },
  };
  const cfg = map[status];
  return (
    <Badge variant={cfg.variant} className="h-5 px-1.5 text-[10px] uppercase tracking-wide">
      {t(cfg.key)}
    </Badge>
  );
}

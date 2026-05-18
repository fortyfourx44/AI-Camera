import { NextRequest, NextResponse } from "next/server";

import {
  HikConnectCamera,
  HikConnectError,
  listHikConnectCameras,
} from "@/lib/hikconnect";
import {
  getActiveHikConnectSession,
  hasStoredHikConnectAccount,
} from "@/lib/hikconnect-session";

export const runtime = "nodejs";

// Small TTL cache of per-device camera lists. The Cloud tab renders many
// thumbnails from the same NVR at once; each uses a fresh snapshot URL.
// Without the cache we'd hit /cameras/info once per channel on initial render
// (32 channels on the user's NVR = 32 calls). The cache collapses that to one.
interface CacheEntry {
  expiresAt: number;
  cameras: HikConnectCamera[];
  inflight?: Promise<HikConnectCamera[]>;
}
const CACHE_TTL_MS = 15_000;
const cache = new Map<string, CacheEntry>();

async function fetchCamerasCached(
  deviceSerial: string,
  force: boolean
): Promise<HikConnectCamera[]> {
  const now = Date.now();
  const hit = cache.get(deviceSerial);
  if (!force && hit && hit.expiresAt > now) return hit.cameras;
  if (hit?.inflight) return hit.inflight;

  const session = await getActiveHikConnectSession();
  const entry: CacheEntry = hit ?? { expiresAt: 0, cameras: [] };
  entry.inflight = listHikConnectCameras(session, deviceSerial)
    .then((cameras) => {
      entry.cameras = cameras;
      entry.expiresAt = Date.now() + CACHE_TTL_MS;
      entry.inflight = undefined;
      return cameras;
    })
    .catch((err) => {
      entry.inflight = undefined;
      throw err;
    });
  cache.set(deviceSerial, entry);
  return entry.inflight;
}

/**
 * Streams a JPEG snapshot for one camera. Always fetches a fresh picUrl from
 * Hik-Connect (signed URLs expire quickly) and proxies the bytes so the
 * snapshot URL + session stay server-side.
 *
 * Query params: deviceSerial (required), channelNo (required), force (opt).
 */
export async function GET(req: NextRequest) {
  if (!hasStoredHikConnectAccount()) {
    return NextResponse.json(
      { error: "No Hik-Connect account configured." },
      { status: 400 }
    );
  }

  const deviceSerial = req.nextUrl.searchParams.get("deviceSerial");
  const channelNoRaw = req.nextUrl.searchParams.get("channelNo");
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!deviceSerial || !channelNoRaw) {
    return NextResponse.json(
      { error: "deviceSerial and channelNo are required" },
      { status: 400 }
    );
  }
  const channelNo = parseInt(channelNoRaw, 10);
  if (!Number.isFinite(channelNo)) {
    return NextResponse.json(
      { error: "channelNo must be a number" },
      { status: 400 }
    );
  }

  try {
    const cameras = await fetchCamerasCached(deviceSerial, force);
    const cam = cameras.find((c) => c.channelNo === channelNo);
    if (!cam) {
      return NextResponse.json(
        { error: "Channel not found on that device" },
        { status: 404 }
      );
    }
    if (!cam.picUrl) {
      // Return 204 so the UI can show a placeholder without logging an error.
      return new NextResponse(null, { status: 204 });
    }

    // Minimal allowlist — accept only hosts we know Hik-Connect uses for
    // thumbnails, so this endpoint can never be turned into a generic proxy.
    let parsed: URL;
    try {
      parsed = new URL(cam.picUrl);
    } catch {
      return NextResponse.json(
        { error: "picUrl is not a valid URL" },
        { status: 502 }
      );
    }
    const hostOk =
      /(^|\.)(hik-connect|ezvizlife|ezviz|ys7)\.com$/i.test(
        parsed.hostname
      ) ||
      /(^|\.)myqcloud\.com$/i.test(parsed.hostname) ||
      /(^|\.)aliyuncs\.com$/i.test(parsed.hostname);
    if (!hostOk) {
      return NextResponse.json(
        {
          error: `picUrl points to an unexpected host (${parsed.hostname}) — refusing to proxy.`,
        },
        { status: 403 }
      );
    }

    const upstream = await fetch(cam.picUrl);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: 502 }
      );
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, max-age=10",
      },
    });
  } catch (err) {
    if (err instanceof HikConnectError) {
      return NextResponse.json(
        { error: err.message, kind: err.kind, code: err.code },
        { status: err.kind === "bad-credentials" ? 401 : 502 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

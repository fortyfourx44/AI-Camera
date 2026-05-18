import fs from "node:fs/promises";

import type { HikConnectSession } from "./hikconnect";
import { HikConnectError } from "./hikconnect";

/**
 * On-demand snapshot fetcher for Hik-Connect cloud cameras.
 *
 * Hik-Connect exposes no single documented "give me a JPEG" endpoint that
 * works across all firmwares — especially not for shared cameras. We probe a
 * handful of known-in-the-wild endpoints in order, remember which one worked
 * for each device, and reuse that winner on subsequent calls.
 *
 * All endpoints require the current session id header. Binary-returning
 * endpoints give us the JPEG directly; JSON-returning endpoints give us a
 * `picUrl` on some CDN which we then GET.
 */

const FEATURE_CODE = "aicaud0c";
const CLIENT_TYPE = "55";
const UA_LANG = "en-US";

type EndpointId =
  | "devconfig-post"
  | "devconfig-get"
  | "devconfig-post2"
  | "other-getPicUrl";

const winnerByDevice = new Map<string, EndpointId>();
let probeLogged = false;

function commonHeaders(sessionId: string): Record<string, string> {
  return {
    clientType: CLIENT_TYPE,
    lang: UA_LANG,
    featureCode: FEATURE_CODE,
    sessionId,
    // Some Hik-Connect clusters appear to gate snapshot endpoints behind
    // additional header checks. These mimic the mobile app's basic webview
    // headers to improve compatibility across regions/firmwares.
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Hik-Connect/5.7.0 (iPhone; iOS 17.0; Scale/3.00) AppleWebKit/605.1.15",
    Origin: "https://www.hik-connect.com",
    Referer: "https://www.hik-connect.com/",
  };
}

function logOnce(msg: string, ...rest: unknown[]) {
  if (probeLogged) return;
  // eslint-disable-next-line no-console
  console.log(`[hikconnect-snapshot] ${msg}`, ...rest);
}

async function looksLikeJpeg(buf: Buffer): Promise<boolean> {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8;
}

async function fetchJpegFromCdn(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new HikConnectError(
      "network",
      `CDN ${res.status} fetching snapshot at ${url.slice(0, 80)}`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!(await looksLikeJpeg(buf))) {
    throw new HikConnectError(
      "unknown",
      `CDN returned ${buf.length} bytes that don't look like JPEG (magic=${buf
        .slice(0, 4)
        .toString("hex")})`
    );
  }
  return buf;
}

async function tryDevconfigPost(
  session: HikConnectSession,
  serial: string,
  channelNo: number
): Promise<Buffer | null> {
  const url = `https://${session.apiDomain}/v3/devconfig/v1/camera/${encodeURIComponent(
    serial
  )}/${channelNo}/snapshot?cmdId=1`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...commonHeaders(session.sessionId),
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const text = await res.text();
  logOnce(
    `devconfig-post ${serial}/${channelNo} -> ${res.status} body[0..200]=${text.slice(0, 200).replace(/\s+/g, " ")}`
  );
  if (!res.ok) return null;
  try {
    const json = JSON.parse(text) as {
      meta?: { code?: number };
      data?: { picUrl?: string };
    };
    if (json.meta?.code !== 200) return null;
    const picUrl = json.data?.picUrl;
    if (!picUrl) return null;
    return await fetchJpegFromCdn(picUrl);
  } catch {
    return null;
  }
}

/**
 * Variant of devconfig snapshot: some clusters expect the "capture" endpoint
 * on the camera resource instead of the per-channel URL.
 */
async function tryDevconfigPost2(
  session: HikConnectSession,
  serial: string,
  channelNo: number
): Promise<Buffer | null> {
  const url = `https://${session.apiDomain}/v3/devconfig/v1/camera/${encodeURIComponent(
    serial
  )}/capture`;
  const form = new URLSearchParams({
    channelNo: String(channelNo),
    cmdId: "1",
  }).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...commonHeaders(session.sessionId),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const text = await res.text();
  logOnce(
    `devconfig-post2 ${serial}/${channelNo} -> ${res.status} body[0..200]=${text.slice(0, 200).replace(/\s+/g, " ")}`
  );
  if (!res.ok) return null;
  try {
    const json = JSON.parse(text) as {
      meta?: { code?: number };
      data?: { picUrl?: string };
      picUrl?: string;
    };
    const picUrl = json.data?.picUrl ?? json.picUrl;
    if (json.meta?.code !== 200 || !picUrl) return null;
    return await fetchJpegFromCdn(picUrl);
  } catch {
    return null;
  }
}

async function tryDevconfigGet(
  session: HikConnectSession,
  serial: string,
  channelNo: number
): Promise<Buffer | null> {
  const url = `https://${session.apiDomain}/v3/devconfig/v1/camera/${encodeURIComponent(
    serial
  )}/capture?channelNo=${channelNo}`;
  const res = await fetch(url, {
    method: "GET",
    headers: commonHeaders(session.sessionId),
  });
  const ct = res.headers.get("content-type") || "";
  logOnce(
    `devconfig-get ${serial}/${channelNo} -> ${res.status} content-type=${ct}`
  );
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (await looksLikeJpeg(buf)) return buf;
  // Some variants wrap a picUrl in JSON here too.
  try {
    const json = JSON.parse(buf.toString("utf8")) as {
      meta?: { code?: number };
      data?: { picUrl?: string };
    };
    const picUrl = json.data?.picUrl;
    if (json.meta?.code === 200 && picUrl) return await fetchJpegFromCdn(picUrl);
  } catch {
    // Not JSON either — give up for this endpoint.
  }
  return null;
}

async function tryOtherGetPicUrl(
  session: HikConnectSession,
  serial: string,
  channelNo: number
): Promise<Buffer | null> {
  const url = `https://${session.apiDomain}/api/other/getPicUrl`;
  const form = new URLSearchParams({
    deviceSerial: serial,
    channelNo: String(channelNo),
    featureCode: FEATURE_CODE,
  }).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...commonHeaders(session.sessionId),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const text = await res.text();
  logOnce(
    `other-getPicUrl ${serial}/${channelNo} -> ${res.status} body[0..200]=${text.slice(0, 200).replace(/\s+/g, " ")}`
  );
  if (!res.ok) return null;
  try {
    const json = JSON.parse(text) as {
      meta?: { code?: number };
      data?: { picUrl?: string };
      picUrl?: string;
    };
    const picUrl = json.data?.picUrl ?? json.picUrl;
    if (!picUrl) return null;
    return await fetchJpegFromCdn(picUrl);
  } catch {
    return null;
  }
}

const ATTEMPTS: Array<{
  id: EndpointId;
  fn: (
    s: HikConnectSession,
    serial: string,
    ch: number
  ) => Promise<Buffer | null>;
}> = [
  { id: "devconfig-post", fn: tryDevconfigPost },
  { id: "devconfig-post2", fn: tryDevconfigPost2 },
  { id: "devconfig-get", fn: tryDevconfigGet },
  { id: "other-getPicUrl", fn: tryOtherGetPicUrl },
];

/**
 * Fetch a fresh JPEG snapshot. First call per device-serial probes endpoints;
 * subsequent calls reuse the winner. If the cached winner starts failing we
 * flush and re-probe on the next call.
 */
export async function fetchSnapshot(
  session: HikConnectSession,
  deviceSerial: string,
  channelNo: number
): Promise<Buffer> {
  const cached = winnerByDevice.get(deviceSerial);
  if (cached) {
    const fn = ATTEMPTS.find((a) => a.id === cached)?.fn;
    if (fn) {
      try {
        const buf = await fn(session, deviceSerial, channelNo);
        if (buf) return buf;
      } catch {
        // Fall through to full re-probe below.
      }
      winnerByDevice.delete(deviceSerial);
    }
  }

  const errors: string[] = [];
  for (const attempt of ATTEMPTS) {
    try {
      const buf = await attempt.fn(session, deviceSerial, channelNo);
      if (buf) {
        winnerByDevice.set(deviceSerial, attempt.id);
        probeLogged = true;
        // eslint-disable-next-line no-console
        console.log(
          `[hikconnect-snapshot] winner for ${deviceSerial} = ${attempt.id} (${buf.length} bytes)`
        );
        return buf;
      }
    } catch (err) {
      errors.push(
        `${attempt.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  probeLogged = true;
  throw new HikConnectError(
    "unknown",
    `No Hik-Connect snapshot endpoint worked for ${deviceSerial}/${channelNo}. Tried: ${ATTEMPTS
      .map((a) => a.id)
      .join(", ")}${errors.length ? "; errors: " + errors.join(" | ") : ""}`
  );
}

/** Convenience: capture a snapshot straight to disk. Returns the written path. */
export async function fetchSnapshotToFile(
  session: HikConnectSession,
  deviceSerial: string,
  channelNo: number,
  filePath: string
): Promise<string> {
  const buf = await fetchSnapshot(session, deviceSerial, channelNo);
  await fs.writeFile(filePath, buf);
  return filePath;
}

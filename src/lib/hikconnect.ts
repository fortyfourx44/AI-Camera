import crypto from "node:crypto";

/**
 * Stateless Hik-Connect cloud API client.
 *
 * Mirrors the request shape used by the HiLook / Hik-Connect mobile app. Based
 * on the open-source Python reference at
 * https://github.com/tomasbedrich/hikconnect — endpoints and error codes are
 * empirically derived, not officially documented, and may break with future
 * Hik-Connect server updates.
 *
 * Regional routing: login always starts at api.hik-connect.com. If the account
 * lives in a non-default region (KSA/ME/EU/RU/...) the server returns
 * meta.code=1100 together with loginArea.apiDomain — we retry once against
 * that domain. The apiDomain is returned to the caller so subsequent device /
 * camera calls hit the right cluster without another login round-trip.
 */

const DEFAULT_API_DOMAIN = "api.hik-connect.com";
const FEATURE_CODE = "aicaud0c"; // any non-empty hex-ish string works; the mobile app uses its build id
const CLIENT_TYPE = "55"; // iOS app client id; most widely-accepted
const UA_LANG = "en-US";

export interface HikConnectSession {
  sessionId: string;
  refreshSessionId: string;
  apiDomain: string;
  /** Unix ms. Parsed from the JWT `exp` claim. */
  expiresAt: number;
}

export interface HikConnectDevice {
  deviceSerial: string;
  fullSerial: string;
  name: string;
  deviceType: string;
  version: string;
  online: boolean;
}

export interface HikConnectCamera {
  cameraId: string;
  cameraName: string;
  channelNo: number;
  deviceSerial: string;
  /** 1 = online, 0 = offline (per Hik-Connect convention). */
  signalStatus: number;
  isShown: number;
  /**
   * Hik-Connect CDN URL to a recent snapshot JPEG. Null when the device has
   * never reported a picture (brand-new cameras) or when the current firmware
   * encrypts thumbnails (battery-powered models). The URL is signed and
   * typically valid for ~a few minutes.
   */
  picUrl: string | null;
}

export class HikConnectError extends Error {
  readonly code: number;
  readonly kind:
    | "bad-credentials"
    | "captcha-required"
    | "network"
    | "unknown";
  constructor(kind: HikConnectError["kind"], message: string, code = 0) {
    super(message);
    this.name = "HikConnectError";
    this.kind = kind;
    this.code = code;
  }
}

function md5(s: string): string {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

function commonHeaders(sessionId?: string): Record<string, string> {
  const h: Record<string, string> = {
    clientType: CLIENT_TYPE,
    lang: UA_LANG,
    featureCode: FEATURE_CODE,
  };
  if (sessionId) h.sessionId = sessionId;
  return h;
}

/** Parse a JWT's `exp` claim (Hik-Connect session ids are standard JWTs). */
function jwtExpMs(token: string): number {
  const parts = token.split(".");
  if (parts.length < 2) return Date.now() + 60 * 60 * 1000; // fall back to 1h
  try {
    const pad = "=".repeat((4 - (parts[1].length % 4)) % 4);
    const json = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/") + pad,
      "base64"
    ).toString("utf8");
    const claims = JSON.parse(json) as { exp?: number };
    if (typeof claims.exp === "number") return claims.exp * 1000;
  } catch {
    // ignore, fall through to default
  }
  return Date.now() + 60 * 60 * 1000;
}

function asJsonResponse(
  raw: unknown
): { meta: { code: number; message?: string } } & Record<string, unknown> {
  if (raw && typeof raw === "object") {
    const r = raw as { meta?: { code?: number; message?: string } } & Record<
      string,
      unknown
    >;
    if (r.meta && typeof r.meta.code === "number") {
      return r as { meta: { code: number; message?: string } } & Record<
        string,
        unknown
      >;
    }
  }
  throw new HikConnectError(
    "unknown",
    `Unexpected response shape: ${JSON.stringify(raw).slice(0, 200)}`
  );
}

async function postForm(
  url: string,
  body: Record<string, string>,
  headers: Record<string, string>
): Promise<unknown> {
  const form = new URLSearchParams(body).toString();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
  } catch (err) {
    throw new HikConnectError(
      "network",
      `Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new HikConnectError(
      "unknown",
      `Non-JSON response (${res.status}): ${text.slice(0, 200)}`
    );
  }
}

async function putForm(
  url: string,
  body: Record<string, string>,
  headers: Record<string, string>
): Promise<unknown> {
  const form = new URLSearchParams(body).toString();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
  } catch (err) {
    throw new HikConnectError(
      "network",
      `Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new HikConnectError(
      "unknown",
      `Non-JSON response (${res.status}): ${text.slice(0, 200)}`
    );
  }
}

async function getJson(
  url: string,
  headers: Record<string, string>
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", headers });
  } catch (err) {
    throw new HikConnectError(
      "network",
      `Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new HikConnectError(
      "unknown",
      `Non-JSON response (${res.status}): ${text.slice(0, 200)}`
    );
  }
}

// ---------- Public API ----------

/**
 * Log in with Hik-Connect account credentials.
 *
 * Follows region redirect (meta.code=1100) by retrying once against the
 * returned apiDomain. Throws HikConnectError for bad creds (1013/1014) or
 * CAPTCHA gates (1015) — on CAPTCHA the only cure is to sign in via the
 * real HiLook app, clear the challenge there, then retry here.
 */
export async function loginHikConnect({
  email,
  password,
  apiDomain = DEFAULT_API_DOMAIN,
  redirectDepth = 0,
}: {
  email: string;
  password: string;
  apiDomain?: string;
  redirectDepth?: number;
}): Promise<HikConnectSession> {
  if (redirectDepth > 2) {
    throw new HikConnectError(
      "unknown",
      "Hik-Connect redirected us too many times during login."
    );
  }

  const url = `https://${apiDomain}/v3/users/login/v2`;
  const raw = await postForm(
    url,
    {
      account: email,
      password: md5(password),
      featureCode: FEATURE_CODE,
    },
    commonHeaders()
  );
  const res = asJsonResponse(raw);

  if (res.meta.code === 1100) {
    const newDomain = (res.loginArea as { apiDomain?: string } | undefined)
      ?.apiDomain;
    if (!newDomain) {
      throw new HikConnectError(
        "unknown",
        "Region redirect without an apiDomain in response."
      );
    }
    return loginHikConnect({
      email,
      password,
      apiDomain: newDomain,
      redirectDepth: redirectDepth + 1,
    });
  }

  if (res.meta.code === 1013 || res.meta.code === 1014) {
    throw new HikConnectError(
      "bad-credentials",
      "Hik-Connect rejected the email / password.",
      res.meta.code
    );
  }
  if (res.meta.code === 1015) {
    throw new HikConnectError(
      "captcha-required",
      "Hik-Connect is asking for a CAPTCHA. Open the HiLook app, sign in there to clear it, then retry.",
      1015
    );
  }
  if (res.meta.code !== 200) {
    throw new HikConnectError(
      "unknown",
      `Hik-Connect login failed: code ${res.meta.code} ${res.meta.message ?? ""}`.trim(),
      res.meta.code
    );
  }

  const session = res.loginSession as
    | { sessionId?: string; rfSessionId?: string }
    | undefined;
  if (!session?.sessionId || !session?.rfSessionId) {
    throw new HikConnectError(
      "unknown",
      "Hik-Connect login succeeded but returned no session tokens."
    );
  }

  return {
    sessionId: session.sessionId,
    refreshSessionId: session.rfSessionId,
    apiDomain,
    expiresAt: jwtExpMs(session.sessionId),
  };
}

/** Refresh a session using the refresh token. Returns a fresh session. */
export async function refreshHikConnectSession(
  session: HikConnectSession
): Promise<HikConnectSession> {
  const url = `https://${session.apiDomain}/v3/apigateway/login`;
  const raw = await putForm(
    url,
    {
      refreshSessionId: session.refreshSessionId,
      featureCode: FEATURE_CODE,
    },
    commonHeaders()
  );
  const res = asJsonResponse(raw);
  if (res.meta.code !== 200) {
    throw new HikConnectError(
      "unknown",
      `Hik-Connect refresh failed: code ${res.meta.code}`,
      res.meta.code
    );
  }
  const info = res.sessionInfo as
    | { sessionId?: string; refreshSessionId?: string }
    | undefined;
  if (!info?.sessionId || !info?.refreshSessionId) {
    throw new HikConnectError(
      "unknown",
      "Hik-Connect refresh returned no session tokens."
    );
  }
  return {
    sessionId: info.sessionId,
    refreshSessionId: info.refreshSessionId,
    apiDomain: session.apiDomain,
    expiresAt: jwtExpMs(info.sessionId),
  };
}

let _loggedDeviceListShape = false;

/** Paginated device list. */
export async function listHikConnectDevices(
  session: HikConnectSession
): Promise<HikConnectDevice[]> {
  const out: HikConnectDevice[] = [];
  const limit = 50;
  let offset = 0;
  let hasNext = true;
  while (hasNext) {
    const url =
      `https://${session.apiDomain}/v3/userdevices/v1/devices/pagelist` +
      `?groupId=-1&limit=${limit}&offset=${offset}` +
      `&filter=CONNECTION,STATUS,STATUS_EXT,P2P,WIFI,NODISTURB,SWITCH,KMS,HIDDNS,TIME_PLAN`;
    const raw = await getJson(url, commonHeaders(session.sessionId));
    const res = asJsonResponse(raw);
    if (res.meta.code !== 200) {
      throw new HikConnectError(
        "unknown",
        `Device list failed: code ${res.meta.code}`,
        res.meta.code
      );
    }

    const devices = (res.deviceInfos as unknown[]) ?? [];

    // One-shot diagnostic for the device-list response too. Some Hikvision
    // accounts carry the thumbnail URL on a top-level `cameraInfos` array,
    // others embed it in `statusInfos[serial].optionals` as a JSON string.
    // Log both once so we can target the right field.
    if (!_loggedDeviceListShape && devices.length > 0) {
      _loggedDeviceListShape = true;
      try {
        const topCameraInfos = (res as Record<string, unknown>).cameraInfos as
          | unknown[]
          | undefined;
        if (Array.isArray(topCameraInfos) && topCameraInfos.length > 0) {
          // eslint-disable-next-line no-console
          console.log(
            "[hikconnect] /devices/pagelist cameraInfos[0] =",
            JSON.stringify(topCameraInfos[0], null, 2)
          );
        } else {
          // eslint-disable-next-line no-console
          console.log(
            "[hikconnect] /devices/pagelist has no top-level cameraInfos array"
          );
        }
        const statuses = res.statusInfos as
          | Record<string, Record<string, unknown>>
          | undefined;
        if (statuses) {
          const firstSerial = Object.keys(statuses)[0];
          if (firstSerial) {
            const opt = statuses[firstSerial].optionals;
            // eslint-disable-next-line no-console
            console.log(
              `[hikconnect] statusInfos[${firstSerial}].optionals =`,
              typeof opt === "string" ? opt.slice(0, 2000) : opt
            );
          }
        }
      } catch {
        // Ignore logging failures.
      }
    }
    const statuses =
      (res.statusInfos as Record<string, { globalStatus?: number }>) ?? {};
    for (const d of devices) {
      const dev = d as {
        deviceSerial?: string;
        fullSerial?: string;
        name?: string;
        deviceType?: string;
        version?: string;
      };
      if (!dev.deviceSerial) continue;
      const st = statuses[dev.deviceSerial];
      out.push({
        deviceSerial: dev.deviceSerial,
        fullSerial: dev.fullSerial ?? dev.deviceSerial,
        name: dev.name ?? dev.deviceSerial,
        deviceType: dev.deviceType ?? "",
        version: dev.version ?? "",
        online: (st?.globalStatus ?? 0) === 1,
      });
    }

    const page = res.page as { hasNext?: boolean } | undefined;
    hasNext = !!page?.hasNext && devices.length > 0;
    offset += limit;
    if (offset > 1000) break; // sanity guard
  }
  return out;
}

/** Set to true once per process after we've logged the response shape. */
let _loggedCameraInfoShape = false;

/** Camera channels on a single device (an NVR returns many; a standalone camera returns one). */
export async function listHikConnectCameras(
  session: HikConnectSession,
  deviceSerial: string
): Promise<HikConnectCamera[]> {
  const url =
    `https://${session.apiDomain}/v3/userdevices/v1/cameras/info` +
    `?deviceSerial=${encodeURIComponent(deviceSerial)}`;
  const raw = await getJson(url, commonHeaders(session.sessionId));
  const res = asJsonResponse(raw);
  if (res.meta.code !== 200) {
    throw new HikConnectError(
      "unknown",
      `Camera list failed: code ${res.meta.code}`,
      res.meta.code
    );
  }
  const cams = (res.cameraInfos as unknown[]) ?? [];

  // One-shot diagnostic: log the first camera's raw object so we can see
  // which field carries the thumbnail URL for this account's devices.
  // Different Hikvision device families nest this under different keys
  // (picUrl, capturePicUrl, videoLevelPicUrl, deviceChannelInfo.picUrl, ...).
  if (!_loggedCameraInfoShape && cams.length > 0) {
    _loggedCameraInfoShape = true;
    try {
      // eslint-disable-next-line no-console
      console.log(
        `[hikconnect] /cameras/info sample for ${deviceSerial} channel[0] =`,
        JSON.stringify(cams[0], null, 2)
      );
      // eslint-disable-next-line no-console
      console.log(
        `[hikconnect] /cameras/info top-level keys = ${Object.keys(
          res as Record<string, unknown>
        ).join(", ")}`
      );
    } catch {
      // Ignore logging failures.
    }
  }
  return cams
    .map((c) => {
      const cam = c as {
        cameraId?: string;
        cameraName?: string;
        channelNo?: number;
        deviceChannelInfo?: { signalStatus?: number; picUrl?: string };
        isShow?: number;
        picUrl?: string;
        capturePicUrl?: string;
      };
      // The snapshot URL can arrive in a few different field names depending
      // on firmware / API version. Take the first non-empty one.
      const rawPic =
        cam.picUrl ||
        cam.capturePicUrl ||
        cam.deviceChannelInfo?.picUrl ||
        "";
      return {
        cameraId: cam.cameraId ?? "",
        cameraName: cam.cameraName ?? "",
        channelNo: cam.channelNo ?? 1,
        deviceSerial,
        signalStatus: cam.deviceChannelInfo?.signalStatus ?? 0,
        isShown: cam.isShow ?? 1,
        picUrl: rawPic && /^https?:\/\//i.test(rawPic) ? rawPic : null,
      } satisfies HikConnectCamera;
    })
    .filter((c) => c.cameraId.length > 0);
}

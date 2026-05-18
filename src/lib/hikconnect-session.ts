import { decryptString, encryptString } from "./crypto";
import { settingsRepo } from "./db";
import {
  HikConnectError,
  HikConnectSession,
  loginHikConnect,
  refreshHikConnectSession,
} from "./hikconnect";

/**
 * Process-local Hik-Connect session manager.
 *
 * - Credentials (email + password) are stored encrypted in the `settings` KV.
 * - The active session (JWT) lives only in memory — a server restart re-logs
 *   in from stored credentials.
 * - Callers go through `getActiveSession()`, which lazy-logs-in on the first
 *   call and auto-refreshes when the session has <15 min left.
 */

export const K_HIKCONNECT_EMAIL = "hikconnect_email";
export const K_HIKCONNECT_PASSWORD = "hikconnect_password_enc";
export const K_HIKCONNECT_API_DOMAIN = "hikconnect_api_domain";
export const K_HIKCONNECT_LAST_LOGIN_AT = "hikconnect_last_login_at";

const REFRESH_EARLY_MS = 15 * 60 * 1000;

let cached: HikConnectSession | null = null;
let inFlight: Promise<HikConnectSession> | null = null;

export function hasStoredHikConnectAccount(): boolean {
  return (
    !!settingsRepo.get(K_HIKCONNECT_EMAIL) &&
    !!settingsRepo.get(K_HIKCONNECT_PASSWORD)
  );
}

export function getStoredHikConnectEmail(): string | null {
  return settingsRepo.get(K_HIKCONNECT_EMAIL);
}

export function getStoredHikConnectLastLoginAt(): number | null {
  const raw = settingsRepo.get(K_HIKCONNECT_LAST_LOGIN_AT);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Stores credentials AFTER a successful test login. Caller must verify first. */
export function saveHikConnectCredentials(
  email: string,
  password: string,
  session: HikConnectSession
): void {
  settingsRepo.set(K_HIKCONNECT_EMAIL, email);
  settingsRepo.set(K_HIKCONNECT_PASSWORD, encryptString(password));
  settingsRepo.set(K_HIKCONNECT_API_DOMAIN, session.apiDomain);
  settingsRepo.set(K_HIKCONNECT_LAST_LOGIN_AT, String(Date.now()));
  cached = session;
}

export function clearHikConnectCredentials(): void {
  settingsRepo.delete(K_HIKCONNECT_EMAIL);
  settingsRepo.delete(K_HIKCONNECT_PASSWORD);
  settingsRepo.delete(K_HIKCONNECT_API_DOMAIN);
  settingsRepo.delete(K_HIKCONNECT_LAST_LOGIN_AT);
  cached = null;
  inFlight = null;
}

function loadStoredPassword(): string {
  const enc = settingsRepo.get(K_HIKCONNECT_PASSWORD);
  if (!enc) {
    throw new HikConnectError(
      "bad-credentials",
      "No Hik-Connect password is stored. Sign in from the Cloud tab first."
    );
  }
  try {
    return decryptString(enc);
  } catch (err) {
    throw new HikConnectError(
      "unknown",
      `Stored Hik-Connect password could not be decrypted (${err instanceof Error ? err.message : "unknown"}). Sign out and in again.`
    );
  }
}

/**
 * Returns a session that is guaranteed to have at least REFRESH_EARLY_MS of
 * life left. Triggers a refresh or full re-login as needed. Thread-safe: if
 * many callers race, only one login/refresh actually happens.
 */
export async function getActiveHikConnectSession(): Promise<HikConnectSession> {
  if (cached && cached.expiresAt - Date.now() > REFRESH_EARLY_MS) {
    return cached;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      if (cached && cached.expiresAt > Date.now()) {
        try {
          const refreshed = await refreshHikConnectSession(cached);
          cached = refreshed;
          return refreshed;
        } catch {
          // Refresh can legitimately fail (expired refresh token). Fall
          // through to a full re-login.
        }
      }

      const email = settingsRepo.get(K_HIKCONNECT_EMAIL);
      if (!email) {
        throw new HikConnectError(
          "bad-credentials",
          "No Hik-Connect account is configured."
        );
      }
      const password = loadStoredPassword();
      const apiDomain =
        settingsRepo.get(K_HIKCONNECT_API_DOMAIN) || undefined;
      const session = await loginHikConnect({ email, password, apiDomain });
      settingsRepo.set(K_HIKCONNECT_API_DOMAIN, session.apiDomain);
      settingsRepo.set(K_HIKCONNECT_LAST_LOGIN_AT, String(Date.now()));
      cached = session;
      return session;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

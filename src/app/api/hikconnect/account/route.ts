import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { HikConnectError, loginHikConnect } from "@/lib/hikconnect";
import {
  clearHikConnectCredentials,
  getStoredHikConnectEmail,
  getStoredHikConnectLastLoginAt,
  hasStoredHikConnectAccount,
  saveHikConnectCredentials,
} from "@/lib/hikconnect-session";

export const runtime = "nodejs";

/** Never returns the password. */
export async function GET() {
  return NextResponse.json({
    configured: hasStoredHikConnectAccount(),
    email: getStoredHikConnectEmail(),
    lastLoginAt: getStoredHikConnectLastLoginAt(),
  });
}

const putSchema = z.object({
  email: z.string().min(3).max(200),
  password: z.string().min(1).max(200),
});

/**
 * Test-login and persist credentials only if the test succeeds. We never store
 * creds that don't actually work — that would produce confusing "login failed"
 * errors every time we tried to refresh.
 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.message },
      { status: 400 }
    );
  }
  const { email, password } = parsed.data;
  try {
    const session = await loginHikConnect({ email, password });
    saveHikConnectCredentials(email, password, session);
    return NextResponse.json({
      ok: true,
      email,
      apiDomain: session.apiDomain,
      sessionExpiresAt: session.expiresAt,
    });
  } catch (err) {
    if (err instanceof HikConnectError) {
      const status =
        err.kind === "bad-credentials"
          ? 401
          : err.kind === "captcha-required"
            ? 423
            : err.kind === "network"
              ? 502
              : 500;
      return NextResponse.json(
        { error: err.message, kind: err.kind, code: err.code },
        { status }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  clearHikConnectCredentials();
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, AUTH_SESSION_TTL_SECONDS, getAuthConfiguration } from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken } from "@/lib/auth/session";

export const runtime = "nodejs";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

type AttemptRecord = {
  failures: number[];
};

const attemptsByClient = new Map<string, AttemptRecord>();

function getClientId(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function recentFailures(clientId: string, now: number) {
  const record = attemptsByClient.get(clientId);
  if (!record) return [];
  const failures = record.failures.filter((attempt) => now - attempt < ATTEMPT_WINDOW_MS);
  if (failures.length) attemptsByClient.set(clientId, { failures });
  else attemptsByClient.delete(clientId);
  return failures;
}

export async function POST(request: Request) {
  const configuration = getAuthConfiguration();
  if (!configuration.enabled) {
    return NextResponse.json({ authenticated: true, protectionEnabled: false });
  }
  if (!configuration.passwordHash || configuration.sessionSecret.length < 32) {
    return NextResponse.json(
      { error: "AI access protection is enabled, but the server authentication variables are incomplete." },
      { status: 503 },
    );
  }

  const clientId = getClientId(request);
  const now = Date.now();
  const failures = recentFailures(clientId, now);
  if (failures.length >= MAX_FAILED_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((ATTEMPT_WINDOW_MS - (now - failures[0])) / 1000));
    return NextResponse.json(
      { error: "Too many incorrect attempts. Please wait before trying again." },
      { headers: { "Retry-After": String(retryAfter) }, status: 429 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Enter the access password." }, { status: 400 });
  }

  if (!password || !(await verifyPassword(password, configuration.passwordHash))) {
    attemptsByClient.set(clientId, { failures: [...failures, now] });
    return NextResponse.json({ error: "The access password is incorrect." }, { status: 401 });
  }

  attemptsByClient.delete(clientId);
  const response = NextResponse.json({ authenticated: true, protectionEnabled: true });
  response.cookies.set({
    httpOnly: true,
    maxAge: AUTH_SESSION_TTL_SECONDS,
    name: AUTH_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: await createSessionToken(configuration.sessionSecret),
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, getAuthConfiguration } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/session";

export async function middleware(request: NextRequest) {
  const configuration = getAuthConfiguration();
  if (!configuration.enabled) return NextResponse.next();
  if (!configuration.passwordHash || configuration.sessionSecret.length < 32) {
    return NextResponse.json(
      { error: "AI access protection is enabled, but its server authentication variables are incomplete." },
      { status: 503 },
    );
  }

  const authenticated = configuration.sessionSecret
    ? await verifySessionToken(request.cookies.get(AUTH_COOKIE_NAME)?.value, configuration.sessionSecret)
    : false;
  if (authenticated) return NextResponse.next();
  return NextResponse.json({ error: "AI access password required." }, { status: 401 });
}

export const config = {
  matcher: ["/api/ecoinvent/assistant/:path*"],
};

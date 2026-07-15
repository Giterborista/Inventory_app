import { AUTH_SESSION_TTL_SECONDS } from "@/lib/auth/config";

type SessionPayload = {
  issuedAt: number;
  expiresAt: number;
};

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importSessionKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(secret: string, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const payload: SessionPayload = {
    issuedAt,
    expiresAt: issuedAt + AUTH_SESSION_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSessionKey(secret),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()) {
  if (!token || !secret) return false;
  const [encodedPayload, encodedSignature, extraPart] = token.split(".");
  if (!encodedPayload || !encodedSignature || extraPart) return false;

  try {
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      await importSessionKey(secret),
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!validSignature) return false;

    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as Partial<SessionPayload>;
    const currentTime = Math.floor(now / 1000);
    return (
      Number.isInteger(payload.issuedAt) &&
      Number.isInteger(payload.expiresAt) &&
      Number(payload.issuedAt) <= currentTime + 60 &&
      Number(payload.expiresAt) > currentTime
    );
  } catch {
    return false;
  }
}


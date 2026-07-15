export const AUTH_COOKIE_NAME = "lci_builder_ai_session";
export const AUTH_SESSION_TTL_SECONDS = 12 * 60 * 60;

function parseBoolean(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized ?? "")) return true;
  if (["0", "false", "no", "off"].includes(normalized ?? "")) return false;
  return null;
}

export function isPasswordProtectionEnabled() {
  const configured = parseBoolean(process.env.AI_AUTH_ENABLED);
  if (configured !== null) return configured;

  // Local `next dev` stays open. A production deployment fails closed unless
  // AI_AUTH_ENABLED is explicitly disabled.
  return process.env.NODE_ENV === "production";
}

export function getAuthConfiguration() {
  return {
    enabled: isPasswordProtectionEnabled(),
    passwordHash: process.env.AI_AUTH_PASSWORD_HASH?.trim() ?? "",
    sessionSecret: process.env.AI_AUTH_SESSION_SECRET?.trim() ?? "",
  };
}

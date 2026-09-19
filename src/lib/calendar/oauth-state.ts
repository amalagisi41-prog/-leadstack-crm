import "server-only";

import crypto from "node:crypto";

const MAX_AGE_MS = 10 * 60 * 1000;

type CalendarOAuthState = {
  subAccountId: string;
  provider: "google" | "outlook";
  nonce: string;
  exp: number;
};

function secret(): string {
  const value = process.env.AUTOMATIONS_TOKEN_SECRET;
  if (!value) throw new Error("Calendar OAuth is not configured.");
  return value;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signCalendarOAuthState(
  subAccountId: string,
  provider: CalendarOAuthState["provider"],
): string {
  const state: CalendarOAuthState = {
    subAccountId,
    provider,
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Date.now() + MAX_AGE_MS,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return payload + "." + sign(payload);
}

export function verifyCalendarOAuthState(
  value: string,
): CalendarOAuthState | null {
  try {
    const [payload, signature] = value.split(".");
    if (!payload || !signature) return null;
    const expected = sign(payload);
    if (
      signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) return null;
    const state = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as CalendarOAuthState;
    if (
      !state.subAccountId ||
      !state.provider ||
      !state.nonce ||
      !Number.isFinite(state.exp) ||
      state.exp < Date.now()
    ) return null;
    return state;
  } catch {
    return null;
  }
}

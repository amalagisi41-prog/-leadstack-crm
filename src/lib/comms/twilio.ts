import "server-only";

import twilio, { type Twilio } from "twilio";
import { getAdminDb } from "@/lib/firebase/admin";
import { agencyAllowsSharedSms } from "@/lib/agency/policy";
import type { SubAccountDoc, TwilioConfig } from "@/types";

/**
 * Two-mode Twilio client resolution:
 *
 *   - Shared mode (default): credentials read from env vars
 *     (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER). Same
 *     behavior the deployment had before per-sub-account creds shipped.
 *
 *   - Dedicated mode (opt-in): when a sub-account has
 *     `twilioConfig.enabled === true`, sends from that sub-account use the
 *     creds stored on the doc. Inbound replies route to that sub-account's
 *     own number. The Messages tab on contact profiles light up.
 *
 * The `getTwilioForSubAccount` resolver is the entry point — pass it a
 * sub-account id and it returns the right { client, fromNumber, mode } for
 * that sub-account. Falls through to shared mode when dedicated isn't
 * configured.
 *
 * Both modes coexist on the same deployment — flipping a sub-account's
 * toggle on or off is fully reversible without touching env vars.
 */

let _envClient: Twilio | null = null;
const _saClientCache = new Map<string, Twilio>();

export type TwilioMode = "shared" | "dedicated";

export interface ResolvedTwilio {
  client: Twilio;
  fromNumber: string;
  mode: TwilioMode;
  /** Populated only in dedicated mode — useful for inbound signature checks. */
  authToken: string;
  accountSid: string;
}

function getEnvTwilio(): Twilio {
  if (!_envClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error(
        "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set. Add them to .env.local to enable shared-mode SMS, or configure a dedicated number on the sub-account.",
      );
    }
    _envClient = twilio(sid, token);
  }
  return _envClient;
}

/**
 * True when shared-mode SMS is available — i.e. the env vars are present.
 * Dedicated mode is checked separately via `subAccountTwilioIsConfigured`.
 */
export function smsIsConfigured(): boolean {
  // `.trim()` so a present-but-blank env var (a stray space/newline pasted into
  // the dashboard) doesn't read as configured — matches the health check and
  // stops the send path from attempting a doomed call.
  return (
    !!process.env.TWILIO_ACCOUNT_SID?.trim() &&
    !!process.env.TWILIO_AUTH_TOKEN?.trim() &&
    !!process.env.TWILIO_FROM_NUMBER?.trim()
  );
}

export function subAccountTwilioIsConfigured(
  cfg: TwilioConfig | null | undefined,
): boolean {
  return !!cfg?.enabled && !!cfg.accountSid && !!cfg.authToken && !!cfg.fromNumber;
}

/**
 * WhatsApp reuses the sub-account's dedicated Twilio credentials (the same
 * accountSid + authToken used for SMS) and adds a dedicated WhatsApp sender
 * number. So "WhatsApp configured" means: dedicated Twilio is enabled AND a
 * `whatsappFromNumber` has been set. There is no shared-env-var fallback for
 * WhatsApp — it's per-sub-account only.
 */
export function subAccountWhatsappIsConfigured(
  cfg: TwilioConfig | null | undefined,
): boolean {
  return (
    !!cfg?.enabled &&
    !!cfg.accountSid &&
    !!cfg.authToken &&
    !!cfg.whatsappFromNumber
  );
}

/**
 * Twilio addresses WhatsApp endpoints as `whatsapp:+E164`. This normalises a
 * raw E.164 number (or an already-prefixed value) to the prefixed form,
 * idempotently — safe to call on values that already carry the prefix.
 */
export function toWhatsappAddress(numberOrAddress: string): string {
  const bare = numberOrAddress.startsWith("whatsapp:")
    ? numberOrAddress.slice("whatsapp:".length)
    : numberOrAddress;
  return `whatsapp:${bare.trim()}`;
}

/** Strip the `whatsapp:` prefix Twilio puts on inbound From/To params. */
export function stripWhatsappPrefix(address: string): string {
  return address.startsWith("whatsapp:")
    ? address.slice("whatsapp:".length)
    : address;
}

/**
 * Build a Twilio client for ad-hoc API calls (e.g. validating creds the
 * operator just typed). Doesn't touch the cache — the caller is responsible
 * for whatever lifecycle they want.
 */
export function buildTwilioClient(accountSid: string, authToken: string): Twilio {
  return twilio(accountSid, authToken);
}

/**
 * Resolve the right Twilio client for a sub-account.
 *
 * @param subAccountId  the sub-account id
 * @param subAccount    optionally pre-fetched sub-account doc to skip a read
 *                      (call sites that already have the doc save a roundtrip)
 *
 * Throws when neither dedicated nor shared mode is configured.
 */
export async function getTwilioForSubAccount(
  subAccountId: string,
  subAccount?: SubAccountDoc | null,
): Promise<ResolvedTwilio> {
  let cfg = subAccount?.twilioConfig ?? null;
  let agencyId = subAccount?.agencyId ?? null;
  if (!subAccount) {
    const data = (
      await getAdminDb().doc(`subAccounts/${subAccountId}`).get()
    ).data() as SubAccountDoc | undefined;
    cfg = data?.twilioConfig ?? null;
    agencyId = data?.agencyId ?? null;
  }

  if (subAccountTwilioIsConfigured(cfg) && cfg) {
    let client = _saClientCache.get(subAccountId);
    if (!client) {
      client = twilio(cfg.accountSid, cfg.authToken);
      _saClientCache.set(subAccountId, client);
    }
    return {
      client,
      fromNumber: cfg.fromNumber,
      mode: "dedicated",
      authToken: cfg.authToken,
      accountSid: cfg.accountSid,
    };
  }

  // No dedicated number — fall back to the shared sender ONLY if the agency
  // still permits it. When the owner has disabled shared SMS, this sub-account
  // must bring its own number.
  if (!(await agencyAllowsSharedSms(agencyId))) {
    throw new Error(
      "Shared SMS is disabled by your agency. Configure a dedicated Twilio number for this sub-account (Settings → SMS) to send.",
    );
  }

  if (!smsIsConfigured()) {
    throw new Error(
      "SMS is not configured. Either set TWILIO_* env vars (shared mode) or enable a dedicated number on the sub-account.",
    );
  }

  return {
    client: getEnvTwilio(),
    fromNumber: process.env.TWILIO_FROM_NUMBER!,
    mode: "shared",
    authToken: process.env.TWILIO_AUTH_TOKEN!,
    accountSid: process.env.TWILIO_ACCOUNT_SID!,
  };
}

/**
 * Drop a cached Twilio client for a sub-account. Call after the operator
 * rotates creds or disables the dedicated config so the next send picks up
 * the new state.
 */
export function invalidateSubAccountTwilioCache(subAccountId: string): void {
  _saClientCache.delete(subAccountId);
}

/**
 * Sub-account-aware send. Prefer this over the legacy `sendSms` for any new
 * code paths — falls through to shared mode automatically when the sub-account
 * hasn't enabled a dedicated number, so existing callers keep working.
 */
export async function sendSmsForSubAccount({
  subAccountId,
  subAccount,
  to,
  body,
}: {
  subAccountId: string;
  subAccount?: SubAccountDoc | null;
  to: string;
  body: string;
}): Promise<{ sid: string; mode: TwilioMode; from: string }> {
  const resolved = await getTwilioForSubAccount(subAccountId, subAccount);
  const msg = await resolved.client.messages.create({
    from: resolved.fromNumber,
    to,
    body,
  });
  return { sid: msg.sid, mode: resolved.mode, from: resolved.fromNumber };
}

/**
 * Sub-account WhatsApp send over Twilio. Reuses the sub-account's dedicated
 * Twilio client (same creds as SMS) but sends from the `whatsappFromNumber`
 * with both addresses carrying the `whatsapp:` prefix. There is no shared
 * fallback — throws if WhatsApp isn't configured for the sub-account.
 *
 * The 24-hour session-window compliance check is NOT done here — callers
 * (the AI orchestrator + the manual-send route) enforce it before calling,
 * because they have the contact's last-inbound timestamp in hand.
 */
export async function sendWhatsappForSubAccount({
  subAccountId,
  subAccount,
  to,
  body,
}: {
  subAccountId: string;
  subAccount?: SubAccountDoc | null;
  to: string;
  body: string;
}): Promise<{ sid: string; from: string }> {
  let cfg = subAccount?.twilioConfig ?? null;
  if (!subAccount) {
    const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
    cfg = (snap.data() as SubAccountDoc | undefined)?.twilioConfig ?? null;
  }
  if (!subAccountWhatsappIsConfigured(cfg) || !cfg?.whatsappFromNumber) {
    throw new Error(
      "WhatsApp is not configured for this sub-account. Set a WhatsApp sender number under Settings → SMS.",
    );
  }
  // cfg.enabled is true (checked above), so this resolves to the dedicated
  // client built from the sub-account's own Twilio creds.
  const resolved = await getTwilioForSubAccount(subAccountId, subAccount);
  const from = toWhatsappAddress(cfg.whatsappFromNumber);
  const msg = await resolved.client.messages.create({
    from,
    to: toWhatsappAddress(to),
    body,
  });
  return { sid: msg.sid, from };
}

/**
 * Sub-account WhatsApp TEMPLATE send over Twilio. Unlike the freeform
 * `sendWhatsappForSubAccount`, this sends a pre-approved template by
 * referencing its Twilio `contentSid` + positional variable values — the
 * only compliant way to message outside the 24h session window.
 *
 * `contentVariables` is an ordered array: index 0 fills {{1}}, index 1 fills
 * {{2}}, etc. We convert it to Twilio's `{ "1": "...", "2": "..." }` JSON form.
 * Caller is responsible for resolving merge tags into the values + confirming
 * the template is approved.
 */
export async function sendWhatsappTemplateForSubAccount({
  subAccountId,
  subAccount,
  to,
  contentSid,
  contentVariables,
}: {
  subAccountId: string;
  subAccount?: SubAccountDoc | null;
  to: string;
  contentSid: string;
  contentVariables: string[];
}): Promise<{ sid: string; from: string }> {
  let cfg = subAccount?.twilioConfig ?? null;
  if (!subAccount) {
    const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
    cfg = (snap.data() as SubAccountDoc | undefined)?.twilioConfig ?? null;
  }
  if (!subAccountWhatsappIsConfigured(cfg) || !cfg?.whatsappFromNumber) {
    throw new Error(
      "WhatsApp is not configured for this sub-account. Set a WhatsApp sender number under Settings → SMS.",
    );
  }
  const resolved = await getTwilioForSubAccount(subAccountId, subAccount);
  const from = toWhatsappAddress(cfg.whatsappFromNumber);
  // Twilio wants a positional map keyed by string indices, JSON-encoded.
  const varMap: Record<string, string> = {};
  contentVariables.forEach((v, i) => {
    varMap[String(i + 1)] = v;
  });
  const msg = await resolved.client.messages.create({
    from,
    to: toWhatsappAddress(to),
    contentSid,
    contentVariables: JSON.stringify(varMap),
  });
  return { sid: msg.sid, from };
}

/**
 * Legacy env-var-only send. Kept for back-compat with any caller that hasn't
 * migrated yet (notably the old automation paths). New code should call
 * `sendSmsForSubAccount` instead so dedicated-mode kicks in automatically.
 */
export async function sendSms({
  to,
  body,
}: {
  to: string;
  body: string;
}): Promise<{ sid: string }> {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error("TWILIO_FROM_NUMBER is not set.");
  }
  const client = getEnvTwilio();
  const msg = await client.messages.create({ from, to, body });
  return { sid: msg.sid };
}

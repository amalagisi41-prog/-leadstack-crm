import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  createSendingDomain,
  getSendingDomain,
  removeSendingDomain,
  validateSendingSubdomain,
} from "@/lib/comms/resend-domains";
import type { ResendConfig, SubAccountDoc } from "@/types";

/**
 * Manage the per-sub-account dedicated email sending domain (platform-managed
 * model — one shared Resend API key, the tenant just verifies their own
 * subdomain and we vary the From address).
 *
 * POST   — register a domain. Body { domainName, fromName?, fromLocalPart? }.
 *          Validates a subdomain, creates the domain on Resend, persists
 *          resendConfig with status from Resend, and returns the DNS records
 *          for the operator to add. Replacing an existing domain removes the
 *          old one from Resend first so the account doesn't accrue orphans.
 * GET    — re-read the live status + DNS records from Resend (records aren't
 *          persisted; they're fetched on demand for display).
 * DELETE — remove the domain from Resend and clear resendConfig (revert to the
 *          shared EMAIL_FROM sender).
 *
 * All three are sub-account-admin gated. Sending itself stays on the shared
 * EMAIL_FROM until status === "verified" (resolved by `tenantFrom`).
 */

const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

interface PostBody {
  domainName?: string;
  fromName?: string;
  fromLocalPart?: string;
}

function resendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!resendConfigured()) {
    return NextResponse.json(
      { error: "Resend isn't configured on this deployment (RESEND_API_KEY)." },
      { status: 503 },
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateSendingSubdomain(body.domainName ?? "");
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const domain = validation.domain;

  const localPart = (body.fromLocalPart?.trim() || "hello").toLowerCase();
  if (!LOCAL_PART_RE.test(localPart)) {
    return NextResponse.json(
      { error: "The send-from mailbox can use letters, numbers, dots, hyphens and underscores only." },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);
  const subSnap = await subRef.get();
  const sub = (subSnap.data() ?? {}) as Partial<SubAccountDoc>;

  if (sub.emailDomainEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "The dedicated email sending domain feature is disabled for this sub-account. Ask your agency owner to enable it.",
      },
      { status: 403 },
    );
  }

  if (!sub.replyToEmail?.trim()) {
    return NextResponse.json(
      {
        error:
          "Set a Reply-To address on the Automations settings page first. Replies to broadcasts and automated emails would otherwise bounce — the sending subdomain has no inbox by default.",
      },
      { status: 400 },
    );
  }

  const fromName = (body.fromName?.trim() || sub.name || "").trim();
  const address = `${localPart}@${domain}`;
  const emailFrom = fromName ? `${fromName} <${address}>` : address;

  // Replacing a previously-registered domain: best-effort remove the old one
  // from Resend so the account doesn't accumulate orphaned domains.
  const existing = sub.resendConfig;
  if (existing?.domainId) {
    await removeSendingDomain(existing.domainId);
  }

  const created = await createSendingDomain(domain);
  if (!created.ok || !created.domainId) {
    return NextResponse.json(
      { error: created.error ?? "Failed to register the domain with Resend." },
      { status: 502 },
    );
  }

  const cfg: ResendConfig = {
    domainId: created.domainId,
    domainName: domain,
    emailFrom,
    status: created.status,
    lastValidatedAt: new Date(),
  };
  await subRef.set(
    { resendConfig: cfg, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return NextResponse.json({
    ok: true,
    status: cfg.status,
    domainName: domain,
    emailFrom,
    records: created.records,
  });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const cfg = (snap.data()?.resendConfig ?? null) as ResendConfig | null;
  if (!cfg) {
    return NextResponse.json({ ok: true, config: null, records: [] });
  }
  if (!resendConfigured()) {
    return NextResponse.json({ ok: true, config: cfg, records: [] });
  }

  const fresh = await getSendingDomain(cfg.domainId);
  return NextResponse.json({
    ok: true,
    config: cfg,
    status: fresh.ok ? fresh.status : cfg.status,
    records: fresh.records,
    error: fresh.error,
  });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);
  const cfg = (await subRef.get()).data()?.resendConfig as
    | ResendConfig
    | null
    | undefined;

  if (cfg?.domainId) {
    await removeSendingDomain(cfg.domainId);
  }

  await subRef.set(
    { resendConfig: null, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return NextResponse.json({ ok: true });
}

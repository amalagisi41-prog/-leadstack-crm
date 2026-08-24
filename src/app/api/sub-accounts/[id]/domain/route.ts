import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  addDomainToVercelProject,
  removeDomainFromVercelProject,
  vercelApiConfigured,
} from "@/lib/domains/vercel-api";

/**
 * PATCH /api/sub-accounts/[id]/domain
 *
 * Saves (or clears) the sub-account's chosen custom domain. Admin only.
 * Body: { domain: string | null }. The value is normalized to a bare host
 * (no scheme, no path, no trailing slash).
 *
 * Saving a domain also attempts to register it on this deployment's Vercel
 * project (see lib/domains/vercel-api.ts for why that's a separate step
 * from DNS pointing here). That attempt is best-effort: the domain is saved
 * either way, because a buyer who isn't on Vercel yet — or whose Vercel
 * token isn't configured — still needs somewhere to record their choice.
 * The response's `vercel` field tells the caller what actually happened so
 * the UI can be honest about it rather than implying success it can't back.
 */
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { domain?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let domain: string | null;
  if (body.domain === null || body.domain === "") {
    domain = null;
  } else if (typeof body.domain !== "string") {
    return NextResponse.json({ error: "domain must be a string or null." }, { status: 400 });
  } else {
    const normalized = body.domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "");
    if (!DOMAIN_RE.test(normalized)) {
      return NextResponse.json(
        { error: "Enter a bare domain like example.com (no https://, no path)." },
        { status: 400 },
      );
    }
    domain = normalized;
  }

  const db = getAdminDb();

  // A domain can only point at one workspace. Without this check two
  // sub-accounts could each claim the same host, leaving which one it
  // actually serves undefined — and silently breaking the live site of
  // whichever tenant connected it first.
  if (domain) {
    const clash = await db
      .collection("subAccounts")
      .where("customDomain", "==", domain)
      .limit(2)
      .get();
    const takenByOther = clash.docs.some((doc) => doc.id !== subAccountId);
    if (takenByOther) {
      return NextResponse.json(
        {
          error: `${domain} is already connected to another workspace. Disconnect it there first, or contact your agency administrator.`,
        },
        { status: 409 },
      );
    }
  }

  // Best-effort Vercel side-effect. Runs BEFORE the Firestore write only in
  // the sense that we want its result in the response — the save itself is
  // never blocked on it, since not every buyer has (or needs) a Vercel
  // token configured.
  let vercel: { attempted: boolean; ok: boolean; message: string | null } = {
    attempted: false,
    ok: true,
    message: null,
  };
  if (domain) {
    if (vercelApiConfigured()) {
      const outcome = await addDomainToVercelProject(domain);
      vercel = {
        attempted: true,
        ok: outcome.ok,
        message: outcome.ok ? null : outcome.message,
      };
    }
  } else {
    // Clearing — best-effort deregister whatever domain was there before,
    // so a stale domain doesn't sit on the Vercel project after the agent
    // disconnects it here.
    const prior = await db.doc(`subAccounts/${subAccountId}`).get();
    const priorDomain =
      typeof prior.data()?.customDomain === "string"
        ? (prior.data()!.customDomain as string)
        : null;
    if (priorDomain && vercelApiConfigured()) {
      await removeDomainFromVercelProject(priorDomain);
    }
  }

  await db.doc(`subAccounts/${subAccountId}`).update({
    customDomain: domain,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true, domain, vercel });
}

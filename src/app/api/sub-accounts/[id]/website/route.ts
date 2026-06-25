import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { MAX_WEBSITES_PER_SUBACCOUNT } from "@/lib/website/limits";
import { blankWebsiteConfig, type WebsiteDoc } from "@/types/website";

/**
 * Create a new (blank, draft) website for this sub-account and return its id.
 * The client adds the returned doc to the card list via onSnapshot, then the
 * operator fills the form and hits Build (which targets
 * `/website/[siteId]/build`).
 *
 * Enforces the per-sub-account cap server-side so a client can't sneak past
 * the limit. Gated by the agency `websiteEnabledByAgency` switch, same as the
 * build route — adding a site is part of the gated feature even though it
 * doesn't call gitpage yet.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const subData = subSnap.data();
  if (subData?.websiteEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "The website builder is disabled for this sub-account. Your agency administrator can enable it from Manage in the agency sub-accounts list.",
      },
      { status: 403 },
    );
  }
  const agencyId = subData?.agencyId as string | undefined;
  if (!agencyId) {
    return NextResponse.json(
      { error: "Sub-account is missing agencyId." },
      { status: 500 },
    );
  }

  const col = db.collection(`subAccounts/${subAccountId}/website`);
  const existing = await col.get();
  if (existing.size >= MAX_WEBSITES_PER_SUBACCOUNT) {
    return NextResponse.json(
      {
        error: `You can create up to ${MAX_WEBSITES_PER_SUBACCOUNT} websites per sub-account. Remove one to add another.`,
      },
      { status: 409 },
    );
  }

  const ref = col.doc();
  const now = FieldValue.serverTimestamp();
  const docData: Omit<WebsiteDoc, "createdAt" | "updatedAt" | "lastBuildAt"> & {
    createdAt: FieldValue;
    updatedAt: FieldValue;
    lastBuildAt: null;
  } = {
    id: ref.id,
    agencyId,
    subAccountId,
    name: `Website ${existing.size + 1}`,
    status: "draft",
    gitpageJobId: null,
    liveUrl: null,
    errorMessage: null,
    partialErrors: null,
    pollAttempts: 0,
    lastBuildAt: null,
    lastBuildByUid: null,
    config: blankWebsiteConfig(),
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(docData);

  return NextResponse.json({ ok: true, siteId: ref.id });
}

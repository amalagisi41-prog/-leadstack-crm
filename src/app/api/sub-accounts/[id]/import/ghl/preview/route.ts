import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  GhlApiError,
  getCustomFields,
  getPipelines,
  listOpportunitiesPage,
  validateGhlAccess,
} from "@/lib/import/ghl/client";
import type { GhlImportConfig } from "@/types";

/**
 * Preview a connected GHL account before importing (Phase 4). Returns the
 * record counts + the pipelines and custom-field definitions the wizard's
 * mapping step needs (it runs `suggestStageMap` / `suggestCustomFields` on
 * these client-side). Sub-account admin only; reads the stored token.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const cfg = snap.data()?.ghlImportConfig as GhlImportConfig | null | undefined;
  if (!cfg?.token || !cfg.locationId) {
    return NextResponse.json(
      { error: "No GoHighLevel connection. Connect a token first." },
      { status: 400 },
    );
  }

  try {
    const [contacts, opps, pipelines, customFields] = await Promise.all([
      validateGhlAccess(cfg.token, cfg.locationId),
      listOpportunitiesPage(cfg.token, cfg.locationId, null),
      getPipelines(cfg.token, cfg.locationId),
      getCustomFields(cfg.token, cfg.locationId),
    ]);
    return NextResponse.json({
      ok: true,
      contactTotal: contacts.contactTotal,
      opportunityTotal: opps.total,
      pipelines,
      customFields,
    });
  } catch (err) {
    if (err instanceof GhlApiError && (err.status === 401 || err.status === 403)) {
      return NextResponse.json(
        { error: "GoHighLevel rejected the stored token — reconnect." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Couldn't read from GoHighLevel. Please try again." },
      { status: 502 },
    );
  }
}

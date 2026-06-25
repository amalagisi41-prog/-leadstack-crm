import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { createGroupServerSide } from "@/lib/server/community-service";
import type { GroupAccess, GroupJoinPolicy } from "@/types/community";

export const dynamic = "force-dynamic";

/**
 * Staff: create a Community group in this sub-account. Admin-only, and only
 * when the agency has enabled Community for the sub-account.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const sub = subSnap.data();
  if (sub?.communityEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "Community is disabled for this sub-account. Your agency administrator can enable it from Manage in the agency sub-accounts list.",
      },
      { status: 403 },
    );
  }

  let body: {
    name?: string;
    about?: string;
    coverUrl?: string | null;
    brandColor?: string | null;
    access?: GroupAccess;
    priceCents?: number | null;
    currency?: string | null;
    joinPolicy?: GroupJoinPolicy;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "A group name is required" }, {
      status: 400,
    });
  }

  const group = await createGroupServerSide({
    subAccountId,
    agencyId: (sub.agencyId as string) ?? access.agencyId ?? "",
    createdByUid: access.uid,
    name: body.name,
    about: body.about,
    coverUrl: body.coverUrl ?? null,
    brandColor: body.brandColor ?? null,
    access: body.access,
    priceCents: body.priceCents ?? null,
    currency: body.currency ?? null,
    joinPolicy: body.joinPolicy,
  });

  return NextResponse.json({ ok: true, group });
}

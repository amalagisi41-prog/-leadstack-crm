import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { updateGroupServerSide } from "@/lib/server/community-service";
import type {
  GroupAccess,
  GroupJoinPolicy,
  GroupStatus,
  ResourceLink,
} from "@/types/community";

export const dynamic = "force-dynamic";

async function requireCommunityAdmin(request: Request, subAccountId: string) {
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (subSnap.data()?.communityEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Community is disabled for this sub-account." },
      { status: 403 },
    );
  }
  return access;
}

/** Staff: update a group's settings (name, about, branding, access, status). */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: subAccountId, groupId } = await ctx.params;
  const access = await requireCommunityAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: {
    name?: string;
    about?: string;
    tagline?: string;
    coverUrl?: string | null;
    cardImageUrl?: string | null;
    logoUrl?: string | null;
    brandColor?: string | null;
    access?: GroupAccess;
    priceCents?: number | null;
    currency?: string | null;
    joinPolicy?: GroupJoinPolicy;
    status?: GroupStatus;
    categories?: string[];
    links?: ResourceLink[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const group = await updateGroupServerSide({
    subAccountId,
    groupId,
    patch: body,
  });
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, group });
}

/** Staff: delete a group. Deletes the doc; subcollections cascade on the
 *  server side is deferred — v1 groups are few and deletion is rare. */
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: subAccountId, groupId } = await ctx.params;
  const access = await requireCommunityAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  await getAdminDb()
    .doc(`subAccounts/${subAccountId}/communityGroups/${groupId}`)
    .delete();
  return NextResponse.json({ ok: true });
}

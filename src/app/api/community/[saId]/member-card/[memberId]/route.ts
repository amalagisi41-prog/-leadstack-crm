import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Member } from "@/types/community";

export const dynamic = "force-dynamic";

/** Member: a peer's public card (name, avatar, bio) for the author popover. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string; memberId: string }> },
) {
  const { saId, memberId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const snap = await getAdminDb()
    .doc(`subAccounts/${saId}/members/${memberId}`)
    .get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const m = snap.data() as Member;
  return NextResponse.json({
    ok: true,
    card: {
      displayName: m.displayName?.trim() || m.email.split("@")[0] || "Member",
      avatarUrl: m.avatarUrl ?? null,
      bio: m.bio ?? "",
    },
  });
}

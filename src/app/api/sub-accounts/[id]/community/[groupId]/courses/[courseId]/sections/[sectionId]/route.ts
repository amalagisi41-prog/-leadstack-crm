import "server-only";

import { NextResponse } from "next/server";
import { requireCommunityStaff } from "@/lib/community/staff-guard";
import {
  deleteSectionServerSide,
  updateSectionServerSide,
} from "@/lib/server/community-classroom-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: {
    params: Promise<{
      id: string;
      groupId: string;
      courseId: string;
      sectionId: string;
    }>;
  },
) {
  const { id: subAccountId, groupId, courseId, sectionId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let patch: { title?: string; order?: number };
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await updateSectionServerSide({ subAccountId, groupId, courseId, sectionId, patch });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: {
    params: Promise<{
      id: string;
      groupId: string;
      courseId: string;
      sectionId: string;
    }>;
  },
) {
  const { id: subAccountId, groupId, courseId, sectionId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteSectionServerSide({ subAccountId, groupId, courseId, sectionId });
  return NextResponse.json({ ok: true });
}

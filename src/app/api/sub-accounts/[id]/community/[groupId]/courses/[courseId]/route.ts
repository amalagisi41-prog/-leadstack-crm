import "server-only";

import { NextResponse } from "next/server";
import { requireCommunityStaff } from "@/lib/community/staff-guard";
import {
  deleteCourseServerSide,
  updateCourseServerSide,
  type CoursePatch,
} from "@/lib/server/community-classroom-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string; courseId: string }> },
) {
  const { id: subAccountId, groupId, courseId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let patch: CoursePatch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  await updateCourseServerSide({ subAccountId, groupId, courseId, patch });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string; courseId: string }> },
) {
  const { id: subAccountId, groupId, courseId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteCourseServerSide({ subAccountId, groupId, courseId });
  return NextResponse.json({ ok: true });
}

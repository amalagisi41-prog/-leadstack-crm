import "server-only";

import { NextResponse } from "next/server";
import { requireCommunityStaff } from "@/lib/community/staff-guard";
import { createSectionServerSide } from "@/lib/server/community-classroom-service";

export const dynamic = "force-dynamic";

/** Staff: add a section to a course. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string; courseId: string }> },
) {
  const { id: subAccountId, groupId, courseId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const section = await createSectionServerSide({
    subAccountId,
    groupId,
    courseId,
    title: body.title ?? "New section",
  });
  return NextResponse.json({ ok: true, section });
}

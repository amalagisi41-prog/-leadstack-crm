import "server-only";

import { NextResponse } from "next/server";
import { requireCommunityStaff } from "@/lib/community/staff-guard";
import { createLessonServerSide } from "@/lib/server/community-classroom-service";

export const dynamic = "force-dynamic";

/** Staff: add a lesson (optionally within a section). */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string; courseId: string }> },
) {
  const { id: subAccountId, groupId, courseId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { title?: string; sectionId?: string | null };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const lesson = await createLessonServerSide({
    subAccountId,
    groupId,
    courseId,
    sectionId: body.sectionId ?? null,
    title: body.title ?? "New lesson",
  });
  return NextResponse.json({ ok: true, lesson });
}

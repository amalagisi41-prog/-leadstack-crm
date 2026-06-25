import "server-only";

import { NextResponse } from "next/server";
import { requireCommunityStaff } from "@/lib/community/staff-guard";
import {
  deleteLessonServerSide,
  updateLessonServerSide,
  type LessonPatch,
} from "@/lib/server/community-classroom-service";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: {
    params: Promise<{
      id: string;
      groupId: string;
      courseId: string;
      lessonId: string;
    }>;
  },
) {
  const { id: subAccountId, groupId, courseId, lessonId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let patch: LessonPatch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = await updateLessonServerSide({
    subAccountId,
    groupId,
    courseId,
    lessonId,
    patch,
  });
  if (result.videoError) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "That video link wasn't recognized. Paste a YouTube or Vimeo URL. Other fields were saved.",
      },
      { status: 422 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  ctx: {
    params: Promise<{
      id: string;
      groupId: string;
      courseId: string;
      lessonId: string;
    }>;
  },
) {
  const { id: subAccountId, groupId, courseId, lessonId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;
  await deleteLessonServerSide({ subAccountId, groupId, courseId, lessonId });
  return NextResponse.json({ ok: true });
}

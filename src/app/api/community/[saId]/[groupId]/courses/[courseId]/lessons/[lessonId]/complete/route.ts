import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { markLessonCompleteServerSide } from "@/lib/server/community-classroom-service";

export const dynamic = "force-dynamic";

/** Member: mark a lesson complete (idempotent). */
export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      saId: string;
      groupId: string;
      courseId: string;
      lessonId: string;
    }>;
  },
) {
  const { saId, groupId, courseId, lessonId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const result = await markLessonCompleteServerSide({
    subAccountId: saId,
    agencyId: access.gate.agencyId,
    groupId,
    courseId,
    memberId: access.member.id,
    lessonId,
  });
  return NextResponse.json({ ok: true, ...result });
}

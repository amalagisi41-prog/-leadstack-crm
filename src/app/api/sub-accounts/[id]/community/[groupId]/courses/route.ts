import "server-only";

import { NextResponse } from "next/server";
import { requireCommunityStaff } from "@/lib/community/staff-guard";
import { createCourseServerSide } from "@/lib/server/community-classroom-service";
import type { CourseAccess } from "@/types/community";

export const dynamic = "force-dynamic";

/** Staff: create a course in a group's classroom. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; groupId: string }> },
) {
  const { id: subAccountId, groupId } = await ctx.params;
  const access = await requireCommunityStaff(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: {
    title?: string;
    description?: string;
    thumbnailUrl?: string | null;
    access?: CourseAccess;
    requiredLevel?: number | null;
    priceCents?: number | null;
    published?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "A course title is required" }, {
      status: 400,
    });
  }

  const course = await createCourseServerSide({
    subAccountId,
    agencyId: access.resolvedAgencyId,
    groupId,
    title: body.title,
    description: body.description,
    thumbnailUrl: body.thumbnailUrl ?? null,
    access: body.access,
    requiredLevel: body.requiredLevel ?? null,
    priceCents: body.priceCents ?? null,
    published: body.published,
  });
  return NextResponse.json({ ok: true, course });
}

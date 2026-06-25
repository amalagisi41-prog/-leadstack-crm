import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { listCoursesForMember } from "@/lib/server/community-classroom-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { PurchaseButton } from "@/components/community/purchase-button";
import { CourseThumb } from "@/components/community/classroom/course-thumb";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

export default async function ClassroomCatalogPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const courses = await listCoursesForMember({
    subAccountId: saId,
    groupId: group.id,
    memberId: member.id,
    membership,
  });

  return (
    <CommunityShell saId={saId} group={group} active="classroom" viewer={viewer}>
      {courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
          No courses yet.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => {
            const card = (
              <div className="overflow-hidden rounded-xl border border-[#E4E4E4] bg-white transition-shadow hover:shadow-sm">
                <CourseThumb
                  thumbnailUrl={c.thumbnailUrl}
                  title={c.title}
                  brand={brand}
                />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-[#202124]">{c.title}</h3>
                    {c.locked && (
                      <span className="flex items-center gap-1 text-xs text-[#909090]">
                        <Lock className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[#909090]">
                    {c.description || `${c.lessonCount} lessons`}
                  </p>
                  {c.locked ? (
                    c.locked.purchasable ? (
                      <div className="mt-3">
                        <PurchaseButton
                          saId={saId}
                          groupId={group.id}
                          scope="course"
                          targetId={c.id}
                          label={c.locked.reason}
                          brand={brand}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        />
                      </div>
                    ) : (
                      <p className="mt-3 text-xs font-medium text-[#909090]">
                        {c.locked.reason}
                      </p>
                    )
                  ) : (
                    <div className="mt-3">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F0F0F0]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${c.progressPct}%`, backgroundColor: brand }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-[#909090]">
                        {c.progressPct}% complete
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
            return c.locked || !c.firstLessonId ? (
              <div key={c.id} className="cursor-default opacity-80">
                {card}
              </div>
            ) : (
              <Link
                key={c.id}
                href={`/c/${saId}/${groupSlug}/classroom/${c.id}/${c.firstLessonId}`}
              >
                {card}
              </Link>
            );
          })}
        </div>
      )}
    </CommunityShell>
  );
}

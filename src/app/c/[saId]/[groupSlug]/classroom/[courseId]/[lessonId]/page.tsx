import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import {
  getCourseTree,
  getEnrollment,
} from "@/lib/server/community-classroom-service";
import { hasPaidCourse } from "@/lib/server/community-purchase-service";
import { embedUrlFor } from "@/lib/community/video-embed";
import { renderLessonBodyHtml } from "@/lib/community/lesson-html";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  LessonPlayer,
  type PlayerLesson,
  type PlayerSection,
} from "@/components/community/classroom/lesson-player";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

export default async function LessonPlayerPage({
  params,
}: {
  params: Promise<{
    saId: string;
    groupSlug: string;
    courseId: string;
    lessonId: string;
  }>;
}) {
  const { saId, groupSlug, courseId, lessonId } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  const catalog = `/c/${saId}/${groupSlug}/classroom`;

  const tree = await getCourseTree({
    subAccountId: saId,
    groupId: group.id,
    courseId,
    includeUnpublished: false,
  });
  if (!tree || !tree.course.published) redirect(catalog);

  // Enforce access locks server-side (level + purchase). Open courses pass.
  const course = tree.course;
  if (course.access === "level") {
    if (membership.level < (course.requiredLevel ?? 2)) redirect(catalog);
  } else if (course.access === "purchase") {
    const paid = await hasPaidCourse(saId, group.id, courseId, member.id);
    if (!paid) redirect(catalog);
  }

  if (!tree.lessons.some((l) => l.id === lessonId)) {
    const first = tree.lessons[0];
    if (!first) redirect(catalog);
    redirect(`${catalog}/${courseId}/${first.id}`);
  }

  const enrollment = await getEnrollment(saId, group.id, courseId, member.id);

  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const sections: PlayerSection[] = tree.sections.map((s) => ({
    id: s.id,
    title: s.title,
  }));
  const lessons: PlayerLesson[] = tree.lessons.map((l) => ({
    id: l.id,
    title: l.title,
    sectionId: l.sectionId,
    embedUrl: embedUrlFor(l.videoProvider, l.videoId),
    body: renderLessonBodyHtml(l.bodyHtml),
    resourceLinks: l.resourceLinks ?? [],
  }));

  return (
    <CommunityShell saId={saId} group={group} active="classroom" viewer={viewer}>
      <Link
        href={catalog}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
      >
        <ArrowLeft className="h-4 w-4" /> {course.title}
      </Link>
      <LessonPlayer
        saId={saId}
        groupId={group.id}
        groupSlug={groupSlug}
        courseId={courseId}
        brand={brand}
        sections={sections}
        lessons={lessons}
        currentLessonId={lessonId}
        completedIds={enrollment?.completedLessonIds ?? []}
      />
    </CommunityShell>
  );
}

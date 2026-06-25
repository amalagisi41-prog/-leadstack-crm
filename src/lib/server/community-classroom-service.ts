import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { parseVideoUrl } from "@/lib/community/video-embed";
import type {
  Course,
  CourseAccess,
  CourseCardView,
  CourseSection,
  Enrollment,
  GroupMembership,
  Lesson,
  ResourceLink,
} from "@/types/community";

/**
 * Server-side Classroom service (Admin SDK). Courses live under a group;
 * sections + lessons are subcollections, lessons flat (each carries
 * `sectionId`). Staff mutate via /api/sub-accounts/[id]/community/[groupId]/
 * courses/*; members read the server-rendered player + mark lessons complete.
 */

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

function coursesCol(saId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${saId}/communityGroups/${groupId}/courses`,
  );
}
function courseDoc(saId: string, groupId: string, courseId: string) {
  return coursesCol(saId, groupId).doc(courseId);
}

/* ------------------------------- Courses ------------------------------- */

export async function createCourseServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  groupId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string | null;
  access?: CourseAccess;
  requiredLevel?: number | null;
  priceCents?: number | null;
  currency?: string | null;
  published?: boolean;
}): Promise<Course> {
  const col = coursesCol(opts.subAccountId, opts.groupId);
  const count = (await col.count().get()).data().count;
  const access: CourseAccess = opts.access ?? "open";
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    groupId: opts.groupId,
    title: opts.title.trim(),
    description: opts.description?.trim() ?? "",
    thumbnailUrl: opts.thumbnailUrl ?? null,
    order: count,
    published: opts.published ?? false,
    access,
    requiredLevel: access === "level" ? (opts.requiredLevel ?? 2) : null,
    priceCents: access === "purchase" ? (opts.priceCents ?? null) : null,
    currency: access === "purchase" ? (opts.currency ?? "USD") : null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col.add(doc);
  return { id: ref.id, ...doc } as Course;
}

export interface CoursePatch {
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  published?: boolean;
  order?: number;
  access?: CourseAccess;
  requiredLevel?: number | null;
  priceCents?: number | null;
  currency?: string | null;
}

export async function updateCourseServerSide(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  patch: CoursePatch;
}): Promise<void> {
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  const p = opts.patch;
  if (typeof p.title === "string") updates.title = p.title.trim();
  if (typeof p.description === "string") updates.description = p.description.trim();
  if (p.thumbnailUrl !== undefined) updates.thumbnailUrl = p.thumbnailUrl;
  if (typeof p.published === "boolean") updates.published = p.published;
  if (typeof p.order === "number") updates.order = p.order;
  if (p.access) {
    updates.access = p.access;
    updates.requiredLevel =
      p.access === "level" ? (p.requiredLevel ?? 2) : null;
    if (p.access === "purchase") {
      if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
      updates.currency = p.currency ?? "USD";
    } else {
      updates.priceCents = null;
      updates.currency = null;
    }
  } else {
    if (p.requiredLevel !== undefined) updates.requiredLevel = p.requiredLevel;
    if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
  }
  await courseDoc(opts.subAccountId, opts.groupId, opts.courseId).update(updates);
}

export async function deleteCourseServerSide(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
}): Promise<void> {
  await getAdminDb().recursiveDelete(
    courseDoc(opts.subAccountId, opts.groupId, opts.courseId),
  );
}

export async function getCourse(
  saId: string,
  groupId: string,
  courseId: string,
): Promise<Course | null> {
  const snap = await courseDoc(saId, groupId, courseId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Course, "id">) };
}

/* ------------------------------ Sections ------------------------------- */

export async function createSectionServerSide(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  title: string;
}): Promise<CourseSection> {
  const col = courseDoc(opts.subAccountId, opts.groupId, opts.courseId).collection(
    "sections",
  );
  const count = (await col.count().get()).data().count;
  const doc = { title: opts.title.trim() || "Untitled section", order: count };
  const ref = await col.add(doc);
  return { id: ref.id, ...doc };
}

export async function updateSectionServerSide(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  sectionId: string;
  patch: { title?: string; order?: number };
}): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (typeof opts.patch.title === "string")
    updates.title = opts.patch.title.trim();
  if (typeof opts.patch.order === "number") updates.order = opts.patch.order;
  await courseDoc(opts.subAccountId, opts.groupId, opts.courseId)
    .collection("sections")
    .doc(opts.sectionId)
    .update(updates);
}

export async function deleteSectionServerSide(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  sectionId: string;
}): Promise<void> {
  await courseDoc(opts.subAccountId, opts.groupId, opts.courseId)
    .collection("sections")
    .doc(opts.sectionId)
    .delete();
  // Lessons keep their now-dangling sectionId and render as "Other".
}

/* ------------------------------- Lessons ------------------------------- */

function lessonsCol(saId: string, groupId: string, courseId: string) {
  return courseDoc(saId, groupId, courseId).collection("lessons");
}

export async function createLessonServerSide(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  sectionId: string | null;
  title: string;
}): Promise<Lesson> {
  const col = lessonsCol(opts.subAccountId, opts.groupId, opts.courseId);
  const count = (await col.count().get()).data().count;
  const doc = {
    sectionId: opts.sectionId,
    title: opts.title.trim() || "Untitled lesson",
    order: count,
    published: false,
    videoUrl: null,
    videoProvider: null,
    videoId: null,
    bodyHtml: "",
    resourceLinks: [] as ResourceLink[],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col.add(doc);
  return { id: ref.id, ...doc } as Lesson;
}

export interface LessonPatch {
  title?: string;
  sectionId?: string | null;
  order?: number;
  published?: boolean;
  videoUrl?: string | null;
  bodyHtml?: string;
  resourceLinks?: ResourceLink[];
}

export async function updateLessonServerSide(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  lessonId: string;
  patch: LessonPatch;
}): Promise<{ videoError?: boolean }> {
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  const p = opts.patch;
  if (typeof p.title === "string") updates.title = p.title.trim();
  if (p.sectionId !== undefined) updates.sectionId = p.sectionId;
  if (typeof p.order === "number") updates.order = p.order;
  if (typeof p.published === "boolean") updates.published = p.published;
  if (typeof p.bodyHtml === "string") updates.bodyHtml = p.bodyHtml;
  if (Array.isArray(p.resourceLinks)) {
    updates.resourceLinks = p.resourceLinks
      .filter((r) => r && r.url?.trim())
      .map((r) => ({ label: r.label?.trim() || r.url.trim(), url: r.url.trim() }))
      .slice(0, 20);
  }
  let videoError = false;
  if (p.videoUrl !== undefined) {
    if (!p.videoUrl) {
      updates.videoUrl = null;
      updates.videoProvider = null;
      updates.videoId = null;
    } else {
      const parsed = parseVideoUrl(p.videoUrl);
      if (parsed) {
        updates.videoUrl = p.videoUrl.trim();
        updates.videoProvider = parsed.provider;
        updates.videoId = parsed.id;
      } else {
        videoError = true; // Leave the existing video untouched.
      }
    }
  }
  await lessonsCol(opts.subAccountId, opts.groupId, opts.courseId)
    .doc(opts.lessonId)
    .update(updates);
  return { videoError };
}

export async function deleteLessonServerSide(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  lessonId: string;
}): Promise<void> {
  await getAdminDb().recursiveDelete(
    lessonsCol(opts.subAccountId, opts.groupId, opts.courseId).doc(opts.lessonId),
  );
}

/* --------------------------- Read: full tree --------------------------- */

export interface CourseTree {
  course: Course;
  sections: CourseSection[];
  lessons: Lesson[];
}

export async function getCourseTree(opts: {
  subAccountId: string;
  groupId: string;
  courseId: string;
  includeUnpublished: boolean;
}): Promise<CourseTree | null> {
  const course = await getCourse(opts.subAccountId, opts.groupId, opts.courseId);
  if (!course) return null;
  const ref = courseDoc(opts.subAccountId, opts.groupId, opts.courseId);
  const [sectionsSnap, lessonsSnap] = await Promise.all([
    ref.collection("sections").orderBy("order", "asc").get(),
    ref.collection("lessons").orderBy("order", "asc").get(),
  ]);
  const sections = sectionsSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CourseSection, "id">) }),
  );
  let lessons = lessonsSnap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<Lesson, "id">) }),
  );
  if (!opts.includeUnpublished) lessons = lessons.filter((l) => l.published);
  return { course, sections, lessons };
}

/* ------------------------- Enrollment / progress ----------------------- */

function enrollmentDoc(
  saId: string,
  groupId: string,
  courseId: string,
  memberId: string,
) {
  return courseDoc(saId, groupId, courseId)
    .collection("enrollments")
    .doc(memberId);
}

export async function getEnrollment(
  saId: string,
  groupId: string,
  courseId: string,
  memberId: string,
): Promise<Enrollment | null> {
  const snap = await enrollmentDoc(saId, groupId, courseId, memberId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<Enrollment, "id">) };
}

/** Idempotently mark a lesson complete + recompute the course progress. */
export async function markLessonCompleteServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  groupId: string;
  courseId: string;
  memberId: string;
  lessonId: string;
}): Promise<{ progressPct: number; completed: boolean }> {
  const ref = enrollmentDoc(
    opts.subAccountId,
    opts.groupId,
    opts.courseId,
    opts.memberId,
  );
  // Total published lessons (the progress denominator).
  const publishedSnap = await lessonsCol(
    opts.subAccountId,
    opts.groupId,
    opts.courseId,
  )
    .where("published", "==", true)
    .get();
  const total = publishedSnap.size || 1;

  const snap = await ref.get();
  const existing = (snap.data() as Omit<Enrollment, "id"> | undefined) ?? null;
  const completed = new Set(existing?.completedLessonIds ?? []);
  completed.add(opts.lessonId);
  const completedIds = Array.from(completed);
  const progressPct = Math.min(100, Math.round((completedIds.length / total) * 100));
  const isComplete = progressPct >= 100;

  await ref.set(
    {
      memberId: opts.memberId,
      courseId: opts.courseId,
      status: isComplete ? "completed" : "enrolled",
      completedLessonIds: completedIds,
      progressPct,
      enrolledAt: existing?.enrolledAt ?? FieldValue.serverTimestamp(),
      completedAt: isComplete ? FieldValue.serverTimestamp() : null,
    },
    { merge: true },
  );

  const wasAlreadyComplete = existing?.status === "completed";
  void emitWebhookEvent({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    mode: "live",
    type: "community.lesson.completed",
    payload: {
      groupId: opts.groupId,
      courseId: opts.courseId,
      lessonId: opts.lessonId,
      memberId: opts.memberId,
      progressPct,
    },
  });
  if (isComplete && !wasAlreadyComplete) {
    void emitWebhookEvent({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      mode: "live",
      type: "community.course.completed",
      payload: {
        groupId: opts.groupId,
        courseId: opts.courseId,
        memberId: opts.memberId,
      },
    });
  }

  return { progressPct, completed: isComplete };
}

/* ------------------------- Member catalog (cards) ---------------------- */

/**
 * Build the member-facing classroom catalog: published courses with the
 * viewer's progress + lock state. Open courses are always accessible;
 * level-locked courses lock below the required level; purchase courses lock
 * until bought (the purchase flow lands in the access-controls slice, so for
 * now they show as locked with a price hint).
 */
export async function listCoursesForMember(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  membership: GroupMembership;
}): Promise<CourseCardView[]> {
  const snap = await coursesCol(opts.subAccountId, opts.groupId)
    .where("published", "==", true)
    .get();
  const courses = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Course, "id">) }))
    .sort((a, b) => a.order - b.order);

  const cards = await Promise.all(
    courses.map(async (course) => {
      const ref = courseDoc(opts.subAccountId, opts.groupId, course.id);
      const [lessonsSnap, enrollSnap] = await Promise.all([
        // No orderBy here — combining where("published") + orderBy("order")
        // would require a composite index. Sort in JS instead (lessons per
        // course are bounded).
        ref.collection("lessons").where("published", "==", true).get(),
        ref.collection("enrollments").doc(opts.memberId).get(),
      ]);
      const lessons = lessonsSnap.docs
        .map((d) => ({ id: d.id, order: (d.data().order as number) ?? 0 }))
        .sort((a, b) => a.order - b.order);
      const enroll = enrollSnap.data() as Enrollment | undefined;

      let locked: { reason: string; purchasable: boolean } | null = null;
      if (course.access === "level") {
        const need = course.requiredLevel ?? 2;
        if (opts.membership.level < need) {
          locked = { reason: `Unlocks at Level ${need}`, purchasable: false };
        }
      } else if (course.access === "purchase") {
        // Unlocked once the member has a paid course purchase (purchases live
        // at the group level, scoped by targetId === courseId).
        const groupPaid = await getAdminDb()
          .collection(
            `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/purchases`,
          )
          .where("memberId", "==", opts.memberId)
          .where("scope", "==", "course")
          .where("targetId", "==", course.id)
          .where("status", "==", "paid")
          .limit(1)
          .get();
        if (groupPaid.empty) {
          const price =
            course.priceCents != null
              ? ` — ${formatPrice(course.priceCents, course.currency)}`
              : "";
          locked = { reason: `Buy${price}`, purchasable: true };
        }
      }

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        thumbnailUrl: course.thumbnailUrl,
        lessonCount: lessons.length,
        progressPct: enroll?.progressPct ?? 0,
        locked,
        firstLessonId: lessons[0]?.id ?? null,
      } satisfies CourseCardView;
    }),
  );
  return cards;
}

import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Community + Courses (Skool-style) — shared types.
 *
 * Unlike the affiliate program, Community is a product feature available to
 * EVERY buyer (not gated on LANDING_VARIANT). It is gated per sub-account by
 * the agency owner via `communityEnabledByAgency` (see {@link
 * "@/types/tenancy".SubAccountDoc}).
 *
 * Identity vs membership (important):
 *  - A {@link Member} is the IDENTITY a person logs in as. It is scoped to ONE
 *    sub-account and lives at `subAccounts/{saId}/members/{memberId}`. One
 *    magic-link login spans every group in that sub-account.
 *  - Group membership (which groups a member has joined, their role/points) is
 *    a SEPARATE record added in a later slice. Creating an identity is harmless
 *    — a member sees no group content until they join one.
 *
 * Members are NOT Firebase Auth users. They authenticate with the same
 * magic-link → HMAC session-cookie model the affiliate portal uses (see
 * `src/lib/community/member-auth.ts`). This keeps the member surface fully
 * separate from staff RBAC — a member session can never reach `/sa/*`.
 */

export type MemberStatus = "active" | "removed";

export interface Member {
  id: string;
  /** Tenancy — the sub-account this identity belongs to. */
  subAccountId: string;
  agencyId: string;
  /** Normalized (trimmed + lowercased) login email. Unique per sub-account. */
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Short member bio shown on their profile + the members directory. */
  bio: string;
  /**
   * The CRM contact this member is reconciled to. Set at creation — joining
   * the community doubles as lead capture. Null only if reconciliation failed.
   */
  contactId: string | null;
  status: MemberStatus;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  /** Stamped on each successful session load; powers "online"/"last active". */
  lastSeenAt: Timestamp | FieldValue | null;
}

/**
 * A group is one Skool-style space: a Community feed + a Classroom + a
 * leaderboard, served at `/c/[saId]/[slug]`. A sub-account may run several.
 * Lives at `subAccounts/{saId}/communityGroups/{groupId}`.
 */
export type GroupAccess = "free" | "paid";
export type GroupJoinPolicy = "open" | "approval";
export type GroupStatus = "draft" | "published";

export interface CommunityGroup {
  id: string;
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string;
  /** URL slug, unique within the sub-account. */
  slug: string;
  /** Long-form rich-text "about" copy shown on the public landing page. */
  about: string;
  /** Short one-line tagline shown under the logo in the join card (≤100 chars). */
  tagline: string;
  /** Hero/cover image on the public About page (left column). */
  coverUrl: string | null;
  /** Image at the top of the right-hand join card (falls back to cover). */
  cardImageUrl: string | null;
  /** Small brand mark shown in the page header (falls back to cover). */
  logoUrl: string | null;
  /**
   * Hex accent that themes the member surface — primary buttons/accents use
   * this instead of Skool amber, so the community wears the agency's brand.
   * Null falls back to a neutral default.
   */
  brandColor: string | null;
  access: GroupAccess;
  /** One-time price in cents when `access === "paid"`. */
  priceCents: number | null;
  currency: string | null;
  joinPolicy: GroupJoinPolicy;
  /** Gamification master switch for the group. */
  pointsEnabled: boolean;
  /** Feed categories (the pill row). Always includes at least "General". */
  categories: string[];
  /** Admin-added links shown in the feed right-rail info card. */
  links: ResourceLink[];
  status: GroupStatus;
  /** Denormalized count of active memberships; bumped on join/leave. */
  memberCount: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/**
 * A member's membership IN a specific group (separate from their sub-account
 * identity {@link Member}). Doc id = memberId, at
 * `subAccounts/{saId}/communityGroups/{groupId}/memberships/{memberId}`.
 */
export type GroupMembershipRole = "member" | "moderator";
export type GroupMembershipStatus =
  | "active"
  | "pending"
  | "removed"
  | "banned";

export interface GroupMembership {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  memberId: string;
  role: GroupMembershipRole;
  status: GroupMembershipStatus;
  /** Gamification points (1 like = 1 point), per-group. */
  points: number;
  /** Derived 1–9 level from {@link points}; stored for cheap leaderboard reads. */
  level: number;
  joinedAt: Timestamp | FieldValue | null;
}

/**
 * A feed post, at
 * `subAccounts/{saId}/communityGroups/{groupId}/posts/{postId}`. Likes live as
 * doc-per-liker in a `likes/{memberId}` subcollection (idempotent toggle);
 * comments in a `comments/{commentId}` subcollection.
 */
export interface CommunityPost {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  authorMemberId: string;
  title: string;
  body: string;
  category: string | null;
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface CommunityComment {
  id: string;
  groupId: string;
  postId: string;
  authorMemberId: string;
  body: string;
  likeCount: number;
  /** Top-level comment id when this is a reply; null for a top-level comment.
   *  Threads are one level deep (Skool-style) — a reply to a reply attaches to
   *  the same top-level parent. */
  parentId: string | null;
  createdAt: Timestamp | FieldValue | null;
}

/**
 * Denormalized author view hydrated for rendering (the post/comment docs only
 * store `authorMemberId`). Combines the {@link Member} identity with their
 * per-group {@link GroupMembership} level.
 */
export interface AuthorView {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

/** A post hydrated with its author + the viewer's like state, for rendering. */
export interface FeedPost extends CommunityPost {
  author: AuthorView;
  likedByViewer: boolean;
}

export interface FeedComment extends CommunityComment {
  author: AuthorView;
  likedByViewer: boolean;
}

/* ------------------------------ Direct messages ----------------------- */

export interface DmMessageView {
  id: string;
  senderId: string;
  body: string;
  createdAtMs: number;
}
export interface DmMemberView {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
}
export interface DmInboxItem {
  threadId: string;
  other: DmMemberView;
  lastBody: string;
  lastAtMs: number | null;
  unread: boolean;
}

/* ----------------------------- Classroom ------------------------------ */

/**
 * A course. Access modes beyond `open` (level-locked / one-time purchase) are
 * enforced in the access-controls slice; the fields are stored here so the
 * builder can set them. Lives at
 * `subAccounts/{saId}/communityGroups/{groupId}/courses/{courseId}`. Sections
 * + lessons are subcollections; lessons are flat (each carries a `sectionId`).
 */
export type CourseAccess = "open" | "level" | "purchase";

export interface Course {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  order: number;
  published: boolean;
  access: CourseAccess;
  /** Required group level when `access === "level"`. */
  requiredLevel: number | null;
  /** One-time price (cents) when `access === "purchase"`. */
  priceCents: number | null;
  currency: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface CourseSection {
  id: string;
  title: string;
  order: number;
}

export type VideoProvider = "youtube" | "vimeo";

export interface ResourceLink {
  label: string;
  url: string;
}

export interface Lesson {
  id: string;
  sectionId: string | null;
  title: string;
  order: number;
  published: boolean;
  videoUrl: string | null;
  videoProvider: VideoProvider | null;
  videoId: string | null;
  bodyHtml: string;
  resourceLinks: ResourceLink[];
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/**
 * A member's enrollment + progress in a course, at
 * `courses/{courseId}/enrollments/{memberId}`. Completed lessons are stored as
 * an id array (bounded ≤200/course) so progress is one read, no subcollection.
 */
export interface Enrollment {
  id: string;
  memberId: string;
  courseId: string;
  status: "enrolled" | "completed";
  completedLessonIds: string[];
  progressPct: number;
  enrolledAt: Timestamp | FieldValue | null;
  completedAt: Timestamp | FieldValue | null;
}

/**
 * A one-time PayPal purchase for group access or a single course, at
 * `subAccounts/{saId}/communityGroups/{groupId}/purchases/{purchaseId}`. v1 is
 * manual-reconcile (admin marks paid) — the doc is shaped so Stripe auto-grant
 * can slot in later by flipping `status` from a webhook instead of by hand.
 */
export type PurchaseScope = "group" | "course";
export type PurchaseStatus = "pending" | "paid" | "void";

export interface Purchase {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  memberId: string;
  scope: PurchaseScope;
  /** groupId (scope=group) or courseId (scope=course). */
  targetId: string;
  amountCents: number;
  currency: string;
  paypalUrl: string;
  status: PurchaseStatus;
  grantedByUid: string | null;
  requestedAt: Timestamp | FieldValue | null;
  paidAt: Timestamp | FieldValue | null;
}

/** A catalog card for the member-facing classroom. */
export interface CourseCardView {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  lessonCount: number;
  progressPct: number;
  /** Lock reason for the viewer, or null when accessible. `purchasable` is
   *  true when the lock clears with a one-time purchase (vs a level unlock). */
  locked: { reason: string; purchasable: boolean } | null;
  firstLessonId: string | null;
}

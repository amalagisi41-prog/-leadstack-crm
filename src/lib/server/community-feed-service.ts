import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { levelForPoints } from "@/config/community";
import type {
  AuthorView,
  CommunityComment,
  CommunityPost,
  FeedComment,
  FeedPost,
  Member,
} from "@/types/community";

/**
 * Server-side feed service (Admin SDK). Members are not Firebase users, so the
 * member feed is server-rendered through these helpers and mutated via POST
 * routes — never the client SDK. Likes are doc-per-liker for idempotent toggles
 * and feed those likes into per-group gamification points (1 like = 1 point to
 * the author, unless you like your own post).
 */

function postsCol(saId: string, groupId: string) {
  return getAdminDb().collection(
    `subAccounts/${saId}/communityGroups/${groupId}/posts`,
  );
}

function displayNameFor(member: Pick<Member, "displayName" | "email">): string {
  if (member.displayName && member.displayName.trim()) {
    return member.displayName.trim();
  }
  return member.email.split("@")[0] || "Member";
}

/**
 * Hydrate {@link AuthorView}s for a set of member ids — their identity (name,
 * avatar) plus per-group level. Batched reads; safe for the bounded post/
 * comment counts in v1.
 */
async function hydrateAuthors(
  saId: string,
  groupId: string,
  memberIds: string[],
): Promise<Map<string, AuthorView>> {
  const db = getAdminDb();
  const unique = Array.from(new Set(memberIds));
  const result = new Map<string, AuthorView>();
  if (unique.length === 0) return result;

  const memberRefs = unique.map((id) =>
    db.doc(`subAccounts/${saId}/members/${id}`),
  );
  const membershipRefs = unique.map((id) =>
    db.doc(`subAccounts/${saId}/communityGroups/${groupId}/memberships/${id}`),
  );
  const [memberSnaps, membershipSnaps] = await Promise.all([
    db.getAll(...memberRefs),
    db.getAll(...membershipRefs),
  ]);

  unique.forEach((id, i) => {
    const m = memberSnaps[i].data() as Member | undefined;
    const membership = membershipSnaps[i].data() as { level?: number } | undefined;
    result.set(id, {
      memberId: id,
      displayName: m
        ? displayNameFor(m)
        : "Former member",
      avatarUrl: m?.avatarUrl ?? null,
      level: membership?.level ?? 1,
    });
  });
  return result;
}

/** Which of `postIds` the viewer has liked. */
async function viewerLikes(
  saId: string,
  groupId: string,
  postIds: string[],
  viewerMemberId: string,
  sub: "posts" | "comments" = "posts",
  parentPostId?: string,
): Promise<Set<string>> {
  const db = getAdminDb();
  if (postIds.length === 0) return new Set();
  const refs = postIds.map((id) =>
    sub === "posts"
      ? db.doc(
          `subAccounts/${saId}/communityGroups/${groupId}/posts/${id}/likes/${viewerMemberId}`,
        )
      : db.doc(
          `subAccounts/${saId}/communityGroups/${groupId}/posts/${parentPostId}/comments/${id}/likes/${viewerMemberId}`,
        ),
  );
  const snaps = await db.getAll(...refs);
  const liked = new Set<string>();
  snaps.forEach((s, i) => {
    if (s.exists) liked.add(postIds[i]);
  });
  return liked;
}

export interface CreatePostInput {
  subAccountId: string;
  agencyId: string;
  groupId: string;
  authorMemberId: string;
  title: string;
  body: string;
  category: string | null;
}

export async function createPostServerSide(
  input: CreatePostInput,
): Promise<CommunityPost> {
  const doc = {
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    groupId: input.groupId,
    authorMemberId: input.authorMemberId,
    title: input.title.trim(),
    body: input.body.trim(),
    category: input.category,
    pinned: false,
    likeCount: 0,
    commentCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await postsCol(input.subAccountId, input.groupId).add(doc);
  return { id: ref.id, ...doc } as CommunityPost;
}

/** List the feed: pinned first, then newest. Optional category filter. */
export async function listFeed(opts: {
  subAccountId: string;
  groupId: string;
  viewerMemberId: string;
  category?: string | null;
  limit?: number;
}): Promise<FeedPost[]> {
  const snap = await postsCol(opts.subAccountId, opts.groupId)
    .orderBy("createdAt", "desc")
    .limit(opts.limit ?? 100)
    .get();

  let posts = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CommunityPost, "id">) }),
  );
  if (opts.category && opts.category !== "All") {
    posts = posts.filter((p) => p.category === opts.category);
  }
  // Pinned float to the top, preserving recency within each band.
  posts.sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const authors = await hydrateAuthors(
    opts.subAccountId,
    opts.groupId,
    posts.map((p) => p.authorMemberId),
  );
  const liked = await viewerLikes(
    opts.subAccountId,
    opts.groupId,
    posts.map((p) => p.id),
    opts.viewerMemberId,
  );

  return posts.map((p) => ({
    ...p,
    author: authors.get(p.authorMemberId) ?? {
      memberId: p.authorMemberId,
      displayName: "Former member",
      avatarUrl: null,
      level: 1,
    },
    likedByViewer: liked.has(p.id),
  }));
}

export async function getFeedPost(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  viewerMemberId: string;
}): Promise<FeedPost | null> {
  const snap = await postsCol(opts.subAccountId, opts.groupId)
    .doc(opts.postId)
    .get();
  if (!snap.exists) return null;
  const post = { id: snap.id, ...(snap.data() as Omit<CommunityPost, "id">) };
  const authors = await hydrateAuthors(opts.subAccountId, opts.groupId, [
    post.authorMemberId,
  ]);
  const liked = await viewerLikes(
    opts.subAccountId,
    opts.groupId,
    [post.id],
    opts.viewerMemberId,
  );
  return {
    ...post,
    author: authors.get(post.authorMemberId) ?? {
      memberId: post.authorMemberId,
      displayName: "Former member",
      avatarUrl: null,
      level: 1,
    },
    likedByViewer: liked.has(post.id),
  };
}

export async function listComments(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  viewerMemberId: string;
}): Promise<FeedComment[]> {
  const snap = await postsCol(opts.subAccountId, opts.groupId)
    .doc(opts.postId)
    .collection("comments")
    .orderBy("createdAt", "asc")
    .limit(200)
    .get();
  const comments = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CommunityComment, "id">) }),
  );
  const authors = await hydrateAuthors(
    opts.subAccountId,
    opts.groupId,
    comments.map((c) => c.authorMemberId),
  );
  const liked = await viewerLikes(
    opts.subAccountId,
    opts.groupId,
    comments.map((c) => c.id),
    opts.viewerMemberId,
    "comments",
    opts.postId,
  );
  return comments.map((c) => ({
    ...c,
    author: authors.get(c.authorMemberId) ?? {
      memberId: c.authorMemberId,
      displayName: "Former member",
      avatarUrl: null,
      level: 1,
    },
    likedByViewer: liked.has(c.id),
  }));
}

export async function createCommentServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  authorMemberId: string;
  body: string;
  parentId?: string | null;
}): Promise<CommunityComment> {
  const db = getAdminDb();
  const postRef = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  const commentRef = postRef.collection("comments").doc();
  const doc = {
    groupId: opts.groupId,
    postId: opts.postId,
    authorMemberId: opts.authorMemberId,
    body: opts.body.trim(),
    likeCount: 0,
    parentId: opts.parentId ?? null,
    createdAt: FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  batch.set(commentRef, doc);
  batch.update(postRef, { commentCount: FieldValue.increment(1) });
  await batch.commit();
  return { id: commentRef.id, ...doc } as CommunityComment;
}

/**
 * Toggle a like on a post (or comment) and keep the author's per-group points
 * + level in sync. Liking your own content toggles the like but awards no
 * points (matches Skool — points come from OTHERS liking you). Transactional so
 * the like doc, the counter, and the points can't drift.
 */
export async function toggleLikeServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  commentId?: string;
  viewerMemberId: string;
}): Promise<{ liked: boolean }> {
  const db = getAdminDb();
  const base = `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`;
  const targetRef = opts.commentId
    ? db.doc(`${base}/posts/${opts.postId}/comments/${opts.commentId}`)
    : db.doc(`${base}/posts/${opts.postId}`);
  const likeRef = targetRef.collection("likes").doc(opts.viewerMemberId);

  return db.runTransaction(async (tx) => {
    const [likeSnap, targetSnap] = await Promise.all([
      tx.get(likeRef),
      tx.get(targetRef),
    ]);
    if (!targetSnap.exists) throw new Error("Not found");
    const authorId = targetSnap.data()!.authorMemberId as string;
    const authorRef = db.doc(`${base}/memberships/${authorId}`);
    const selfLike = authorId === opts.viewerMemberId;

    // Read author membership only when points actually change.
    const authorSnap = selfLike ? null : await tx.get(authorRef);

    // pointEvents is the time-series feed that powers the 7-day / 30-day
    // leaderboard windows (all-time reads the denormalized membership.points).
    const pointEventsCol = db.collection(`${base}/pointEvents`);

    if (likeSnap.exists) {
      tx.delete(likeRef);
      tx.update(targetRef, { likeCount: FieldValue.increment(-1) });
      if (authorSnap?.exists) {
        const points = Math.max(0, ((authorSnap.data()!.points as number) ?? 0) - 1);
        tx.update(authorRef, { points, level: levelForPoints(points) });
        tx.set(pointEventsCol.doc(), {
          memberId: authorId,
          delta: -1,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return { liked: false };
    }

    tx.set(likeRef, { createdAt: FieldValue.serverTimestamp() });
    tx.update(targetRef, { likeCount: FieldValue.increment(1) });
    if (authorSnap?.exists) {
      const points = ((authorSnap.data()!.points as number) ?? 0) + 1;
      tx.update(authorRef, { points, level: levelForPoints(points) });
      tx.set(pointEventsCol.doc(), {
        memberId: authorId,
        delta: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { liked: true };
  });
}

export async function setPinnedServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  pinned: boolean;
}): Promise<void> {
  await postsCol(opts.subAccountId, opts.groupId)
    .doc(opts.postId)
    .update({ pinned: opts.pinned, updatedAt: FieldValue.serverTimestamp() });
}

export async function deletePostServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
}): Promise<void> {
  // Recursive delete cleans up the comments + likes subcollections.
  const ref = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  await getAdminDb().recursiveDelete(ref);
}

/** Returns the comment's author id (for the author-or-moderator delete check). */
export async function getCommentAuthor(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  commentId: string;
}): Promise<string | null> {
  const snap = await postsCol(opts.subAccountId, opts.groupId)
    .doc(opts.postId)
    .collection("comments")
    .doc(opts.commentId)
    .get();
  return snap.exists ? (snap.data()!.authorMemberId as string) : null;
}

export async function deleteCommentServerSide(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
  commentId: string;
}): Promise<void> {
  const db = getAdminDb();
  const postRef = postsCol(opts.subAccountId, opts.groupId).doc(opts.postId);
  const commentRef = postRef.collection("comments").doc(opts.commentId);
  if (!(await commentRef.get()).exists) return;
  await db.recursiveDelete(commentRef);
  await postRef.update({ commentCount: FieldValue.increment(-1) });
}

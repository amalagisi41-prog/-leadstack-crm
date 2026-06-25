import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import {
  getFeedPost,
  listComments,
} from "@/lib/server/community-feed-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  PostDetailView,
  type ClientComment,
} from "@/components/community/feed/post-detail-view";
import type { ClientPost } from "@/components/community/feed/feed-view";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as {
    toMillis?: () => number;
    toDate?: () => Date;
    seconds?: number;
    _seconds?: number;
  };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string; postId: string }>;
}) {
  const { saId, groupSlug, postId } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  const feedPost = await getFeedPost({
    subAccountId: saId,
    groupId: group.id,
    postId,
    viewerMemberId: member.id,
  });
  if (!feedPost) notFound();

  const comments = await listComments({
    subAccountId: saId,
    groupId: group.id,
    postId,
    viewerMemberId: member.id,
  });

  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const post: ClientPost = {
    id: feedPost.id,
    authorMemberId: feedPost.authorMemberId,
    title: feedPost.title,
    body: feedPost.body,
    category: feedPost.category,
    pinned: feedPost.pinned,
    likeCount: feedPost.likeCount,
    commentCount: feedPost.commentCount,
    createdAtMs: toMillis(feedPost.createdAt),
    author: feedPost.author,
    likedByViewer: feedPost.likedByViewer,
  };

  const clientComments: ClientComment[] = comments.map((c) => ({
    id: c.id,
    body: c.body,
    likeCount: c.likeCount,
    likedByViewer: c.likedByViewer,
    createdAtMs: toMillis(c.createdAt),
    parentId: c.parentId ?? null,
    author: c.author,
  }));

  return (
    <CommunityShell saId={saId} group={group} active="community" viewer={viewer}>
      <Link
        href={`/c/${saId}/${group.slug}/community`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to feed
      </Link>
      <PostDetailView
        saId={saId}
        groupId={group.id}
        groupSlug={group.slug}
        brand={brand}
        post={post}
        initialComments={clientComments}
        viewer={{
          memberId: member.id,
          role: membership.role,
          displayName: viewer.displayName,
          avatarUrl: viewer.avatarUrl,
          level: viewer.level,
        }}
      />
    </CommunityShell>
  );
}

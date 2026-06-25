import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { listFeed } from "@/lib/server/community-feed-service";
import {
  getLeaderboard,
  listMemberDirectory,
} from "@/lib/server/community-leaderboard-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { FeedView, type ClientPost } from "@/components/community/feed/feed-view";
import { MemberAvatar } from "@/components/community/member-avatar";
import { GroupRailCard } from "@/components/community/group-rail-card";
import type { AuthorView } from "@/types/community";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

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

export default async function CommunityFeedPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership, gate } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;

  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const feed = await listFeed({
    subAccountId: saId,
    groupId: group.id,
    viewerMemberId: member.id,
  });

  const posts: ClientPost[] = feed.map((p) => ({
    id: p.id,
    authorMemberId: p.authorMemberId,
    title: p.title,
    body: p.body,
    category: p.category,
    pinned: p.pinned,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    createdAtMs: toMillis(p.createdAt),
    author: p.author,
    likedByViewer: p.likedByViewer,
  }));

  void gate;

  const [topMembers, directory] = await Promise.all([
    getLeaderboard({
      subAccountId: saId,
      groupId: group.id,
      window: "all",
      limit: 5,
    }),
    listMemberDirectory({ subAccountId: saId, groupId: group.id }),
  ]);

  const now = Date.now();
  const activeMembers = directory.filter((r) => r.status === "active");
  const isOnline = (ms: number | null) => !!ms && now - ms < ONLINE_WINDOW_MS;
  const memberCount = activeMembers.length;
  const onlineCount = activeMembers.filter((r) => isOnline(r.lastSeenAtMs)).length;
  const adminCount = activeMembers.filter((r) => r.role === "moderator").length;
  const avatars: AuthorView[] = [...activeMembers]
    .sort(
      (a, b) =>
        Number(isOnline(b.lastSeenAtMs)) - Number(isOnline(a.lastSeenAtMs)) ||
        b.points - a.points,
    )
    .slice(0, 8)
    .map((r) => ({
      memberId: r.memberId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      level: r.level,
    }));

  return (
    <CommunityShell
      saId={saId}
      group={group}
      active="community"
      viewer={viewer}
      rightRail={
        <>
          <GroupRailCard
            group={group}
            brand={brand}
            memberCount={memberCount}
            onlineCount={onlineCount}
            adminCount={adminCount}
            avatars={avatars}
          />
          {topMembers.length > 0 && (
            <div className="rounded-xl border border-[#E4E4E4] bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#202124]">
                  Leaderboard
                </h2>
                <Link
                  href={`/c/${saId}/${group.slug}/leaderboards`}
                  className="text-xs text-[#909090] hover:text-[#202124]"
                >
                  See all
                </Link>
              </div>
              <div className="space-y-2">
                {topMembers.map((r) => (
                  <div key={r.memberId} className="flex items-center gap-2">
                    <span className="w-4 text-xs font-semibold text-[#909090]">
                      {r.rank}
                    </span>
                    <MemberAvatar
                      author={{
                        memberId: r.memberId,
                        displayName: r.displayName,
                        avatarUrl: r.avatarUrl,
                        level: r.level,
                      }}
                      size={28}
                      brand={brand}
                    />
                    <span className="flex-1 truncate text-xs text-[#202124]">
                      {r.displayName}
                    </span>
                    <span className="text-xs font-semibold text-[#909090]">
                      +{r.points}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      }
    >
      <FeedView
        saId={saId}
        groupId={group.id}
        groupSlug={group.slug}
        brand={brand}
        categories={group.categories}
        viewer={{
          memberId: member.id,
          role: membership.role,
          displayName: viewer.displayName,
          avatarUrl: viewer.avatarUrl,
          level: viewer.level,
        }}
        initialPosts={posts}
      />
    </CommunityShell>
  );
}

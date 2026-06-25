import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import {
  getLeaderboard,
  type LeaderboardWindow,
} from "@/lib/server/community-leaderboard-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { MemberAvatar } from "@/components/community/member-avatar";
import { cn } from "@/lib/utils";
import type { AuthorView } from "@/types/community";

export const dynamic = "force-dynamic";

const WINDOWS: { key: LeaderboardWindow; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All-time" },
];

export default async function LeaderboardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const { saId, groupSlug } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const sp = await searchParams;
  const win: LeaderboardWindow =
    sp.window === "30d" || sp.window === "all" ? sp.window : "7d";

  const { group, member, membership } = access;
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const rows = await getLeaderboard({
    subAccountId: saId,
    groupId: group.id,
    window: win,
  });

  return (
    <CommunityShell saId={saId} group={group} active="leaderboards" viewer={viewer}>
      <div className="mb-4 flex gap-1.5">
        {WINDOWS.map((w) => (
          <Link
            key={w.key}
            href={`/c/${saId}/${groupSlug}/leaderboards?window=${w.key}`}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              win === w.key
                ? "border-transparent text-white"
                : "border-[#E4E4E4] bg-white text-[#909090] hover:text-[#202124]",
            )}
            style={win === w.key ? { backgroundColor: brand } : undefined}
          >
            {w.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
          No points earned in this window yet. Likes on posts and comments earn
          points.
        </div>
      ) : (
        <div className="divide-y divide-[#f0f0f0] rounded-xl border border-[#E4E4E4] bg-white">
          {rows.map((r) => (
            <div
              key={r.memberId}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                r.memberId === member.id && "bg-[#F8F7F5]",
              )}
            >
              <span
                className={cn(
                  "w-6 text-center text-sm font-semibold",
                  r.rank <= 3 ? "text-[#202124]" : "text-[#909090]",
                )}
              >
                {r.rank}
              </span>
              <MemberAvatar
                author={{
                  memberId: r.memberId,
                  displayName: r.displayName,
                  avatarUrl: r.avatarUrl,
                  level: r.level,
                }}
                size={36}
                brand={brand}
              />
              <span className="flex-1 truncate text-sm font-medium text-[#202124]">
                {r.displayName}
              </span>
              <span className="text-sm font-semibold text-[#202124]">
                +{r.points}
              </span>
            </div>
          ))}
        </div>
      )}
    </CommunityShell>
  );
}

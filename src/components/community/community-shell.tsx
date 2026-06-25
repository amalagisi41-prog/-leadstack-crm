import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AuthorView, CommunityGroup } from "@/types/community";
import { MemberAvatar } from "./member-avatar";
import { DmLauncher } from "./dm/dm-launcher";

export const COMMUNITY_BG = "#F8F7F5";
export const COMMUNITY_DEFAULT_BRAND = "#202124";

export type CommunityTab =
  | "community"
  | "classroom"
  | "members"
  | "leaderboards"
  | "about";

/**
 * Skool-style group shell: a thin top bar with the group name + horizontal tab
 * row, a center content column, and an optional right rail. Brand-themed —
 * the active tab + accents use the group's `brandColor`, not Skool amber.
 * Server component (no client state needed); sign-out is a form POST.
 */
export function CommunityShell({
  saId,
  group,
  active,
  viewer,
  children,
  rightRail,
}: {
  saId: string;
  group: CommunityGroup;
  active: CommunityTab;
  viewer: AuthorView;
  children: ReactNode;
  rightRail?: ReactNode;
}) {
  const brand = group.brandColor?.trim() || COMMUNITY_DEFAULT_BRAND;
  const base = `/c/${saId}/${group.slug}`;
  const tabs: { key: CommunityTab; label: string; href: string }[] = [
    { key: "community", label: "Community", href: `${base}/community` },
    { key: "classroom", label: "Classroom", href: `${base}/classroom` },
    { key: "members", label: "Members", href: `${base}/members` },
    { key: "leaderboards", label: "Leaderboards", href: `${base}/leaderboards` },
    { key: "about", label: "About", href: base },
  ];

  return (
    <div className="min-h-screen" style={{ backgroundColor: COMMUNITY_BG }}>
      <header className="border-b border-[#E4E4E4] bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link
            href={base}
            className="truncate text-sm font-semibold text-[#202124]"
          >
            {group.name}
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const isActive = t.key === active;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  className="border-b-2 px-3 py-2 text-sm font-medium transition-colors"
                  style={
                    isActive
                      ? { borderColor: brand, color: "#202124" }
                      : { borderColor: "transparent", color: "#909090" }
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <DmLauncher saId={saId} viewerId={viewer.memberId} brand={brand} />
            <Link href={`${base}/profile`} title="Your profile">
              <MemberAvatar author={viewer} size={28} brand={brand} />
            </Link>
            <form action={`/api/community/${saId}/logout`} method="post">
              <button
                type="submit"
                className="text-xs text-[#909090] hover:text-[#202124]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main
        className={cn(
          "mx-auto max-w-5xl gap-6 px-4 py-6",
          rightRail !== undefined && "grid md:grid-cols-[1fr_320px]",
        )}
      >
        <div className="min-w-0">{children}</div>
        {rightRail !== undefined && (
          <aside className="hidden md:block">
            <div className="space-y-4 md:sticky md:top-6">{rightRail}</div>
          </aside>
        )}
      </main>
    </div>
  );
}

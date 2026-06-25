"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Search, Tag } from "lucide-react";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu, type MenuItem } from "@/components/community/actions-menu";
import { DmThreadModal } from "@/components/community/dm/dm-thread-modal";
import { cn } from "@/lib/utils";
import type { DmMemberView } from "@/types/community";

export interface DirectoryRow {
  memberId: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string | null;
  level: number;
  points: number;
  role: "member" | "moderator";
  status: "active" | "banned";
  joinedAtMs: number | null;
  lastSeenAtMs: number | null;
}

function joinedLabel(ms: number | null): string {
  if (!ms) return "Joined recently";
  return `Joined ${new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function presence(ms: number | null): { online: boolean; label: string } {
  if (!ms) return { online: false, label: "Offline" };
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 5) return { online: true, label: "Online now" };
  if (mins < 60) return { online: false, label: `Active ${mins}m ago` };
  const h = Math.floor(mins / 60);
  if (h < 24) return { online: false, label: `Active ${h}h ago` };
  return { online: false, label: `Active ${Math.floor(h / 24)}d ago` };
}

export function MembersDirectory({
  saId,
  groupId,
  brand,
  accessLabel,
  viewerMemberId,
  viewerIsModerator,
  initialRows,
}: {
  saId: string;
  groupId: string;
  brand: string;
  accessLabel: string;
  viewerMemberId: string;
  viewerIsModerator: boolean;
  initialRows: DirectoryRow[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [tab, setTab] = useState<"active" | "banned">("active");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [dmTarget, setDmTarget] = useState<DmMemberView | null>(null);

  const counts = useMemo(
    () => ({
      active: rows.filter((r) => r.status === "active").length,
      banned: rows.filter((r) => r.status === "banned").length,
    }),
    [rows],
  );

  const visible = rows
    .filter((r) => r.status === tab)
    .filter((r) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      return (
        r.displayName.toLowerCase().includes(s) ||
        r.handle.toLowerCase().includes(s)
      );
    });

  async function act(
    memberId: string,
    action: "promote" | "demote" | "ban" | "unban" | "remove",
  ) {
    if (
      (action === "ban" || action === "remove") &&
      !confirm(`${action === "ban" ? "Ban" : "Remove"} this member?`)
    ) {
      return;
    }
    setBusy(memberId);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
      setRows((prev) => {
        if (action === "remove") return prev.filter((r) => r.memberId !== memberId);
        return prev.map((r) =>
          r.memberId === memberId
            ? {
                ...r,
                role:
                  action === "promote"
                    ? "moderator"
                    : action === "demote"
                      ? "member"
                      : r.role,
                status:
                  action === "ban"
                    ? "banned"
                    : action === "unban"
                      ? "active"
                      : r.status,
              }
            : r,
        );
      });
      const msg: Record<typeof action, string> = {
        promote: "Promoted to moderator",
        demote: "Moderator removed",
        ban: "Member banned",
        unban: "Member un-banned",
        remove: "Member removed",
      };
      toast.success(msg[action]);
    } catch {
      toast.error("Action failed");
    } finally {
      setBusy(null);
    }
  }

  function menuFor(r: DirectoryRow): MenuItem[] {
    if (!viewerIsModerator || r.memberId === viewerMemberId) return [];
    return [
      {
        label: r.role === "moderator" ? "Remove moderator" : "Make moderator",
        onClick: () => act(r.memberId, r.role === "moderator" ? "demote" : "promote"),
      },
      r.status === "banned"
        ? { label: "Un-ban member", onClick: () => act(r.memberId, "unban") }
        : { label: "Ban member", onClick: () => act(r.memberId, "ban"), destructive: true },
      { label: "Remove member", onClick: () => act(r.memberId, "remove"), destructive: true },
    ];
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          <Tab active={tab === "active"} brand={brand} onClick={() => setTab("active")}>
            Active {counts.active}
          </Tab>
          {viewerIsModerator && (
            <Tab active={tab === "banned"} brand={brand} onClick={() => setTab("banned")}>
              Banned {counts.banned}
            </Tab>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#909090]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members"
            className="h-9 w-56 rounded-md border border-[#E4E4E4] bg-white pl-8 pr-3 text-sm text-[#202124] outline-none placeholder:text-[#909090]"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
          No members here.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const p = presence(r.lastSeenAtMs);
            const items = menuFor(r);
            return (
              <div
                key={r.memberId}
                className={cn(
                  "rounded-xl border border-[#E4E4E4] bg-white p-4",
                  busy === r.memberId && "opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <MemberAvatar
                    author={{
                      memberId: r.memberId,
                      displayName: r.displayName,
                      avatarUrl: r.avatarUrl,
                      level: r.level,
                    }}
                    size={48}
                    brand={brand}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-[#202124]">
                            {r.displayName}
                          </span>
                          {r.role === "moderator" && (
                            <span className="rounded-full bg-[#F0F0F0] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#909090]">
                              Mod
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#909090]">{r.handle}</div>
                        {r.bio && (
                          <p className="mt-1 line-clamp-2 text-sm text-[#3a3a44]">
                            {r.bio}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {r.memberId !== viewerMemberId &&
                          r.status === "active" && (
                            <button
                              onClick={() =>
                                setDmTarget({
                                  memberId: r.memberId,
                                  displayName: r.displayName,
                                  avatarUrl: r.avatarUrl,
                                })
                              }
                              className="rounded-md border border-[#E4E4E4] px-2.5 py-1 text-xs font-medium text-[#202124] hover:bg-[#F8F7F5]"
                            >
                              Message
                            </button>
                          )}
                        {items.length > 0 && <ActionsMenu items={items} />}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-1.5 text-sm text-[#3a3a44] sm:grid-cols-2">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            p.online ? "bg-emerald-500" : "bg-[#c4c4c4]",
                          )}
                        />
                        {p.label}
                      </span>
                      <span className="flex items-center gap-2">
                        <Tag className="h-3.5 w-3.5 text-[#909090]" />
                        {accessLabel}
                      </span>
                      <span className="flex items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5 text-[#909090]" />
                        {joinedLabel(r.joinedAtMs)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dmTarget && (
        <DmThreadModal
          saId={saId}
          viewerId={viewerMemberId}
          other={dmTarget}
          brand={brand}
          onClose={() => setDmTarget(null)}
        />
      )}
    </div>
  );
}

function Tab({
  active,
  brand,
  onClick,
  children,
}: {
  active: boolean;
  brand: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent text-white"
          : "border-[#E4E4E4] bg-white text-[#909090] hover:text-[#202124]",
      )}
      style={active ? { backgroundColor: brand } : undefined}
    >
      {children}
    </button>
  );
}

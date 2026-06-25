"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  Facebook,
  Instagram,
  Link2,
  Loader2,
  Lock,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToSocialPosts } from "@/lib/firestore/social-posts";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SocialContentCalendar } from "@/components/social/social-content-calendar";
import { SocialPostComposer } from "@/components/social/social-post-composer";
import { SocialConnections } from "@/components/social/social-connections";
import type { SocialPostDoc, SocialPostStatus } from "@/types/social";

/**
 * Social Planner — schedule + auto-publish posts to the connected Facebook
 * Page / Instagram Business account. Gated by `socialPlannerEnabledByAgency`;
 * renders a locked state when off. Two tabs: Calendar (content calendar +
 * post list) and Connections.
 */

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate();
  if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  return null;
}

const STATUS_BADGE: Record<SocialPostStatus, string> = {
  draft: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  scheduled: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  publishing: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  published: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  failed: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function SocialPlannerPage() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [posts, setPosts] = useState<SocialPostDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"calendar" | "connections">("calendar");
  const [composerOpen, setComposerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const gateOn = subAccount?.socialPlannerEnabledByAgency === true;
  const cfg = subAccount?.metaConfig ?? null;
  // Posting readiness is the capability flag, not a bare "connected" — a
  // connection made for the inbox only must not look post-ready here.
  const canPublish = metaCanPublish(cfg);
  const canFacebook = canPublish && !!cfg?.pageId;
  const canInstagram = canPublish && !!cfg?.instagramBusinessAccountId;

  useEffect(() => {
    if (!subAccountId || !gateOn) return;
    const unsub = subscribeToSocialPosts(
      subAccountId,
      (list) => {
        setPosts(list);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return () => unsub();
  }, [subAccountId, gateOn]);

  async function deletePost(id: string) {
    if (deletingId) return;
    if (!confirm("Delete this post? Scheduled posts won't publish.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/social/posts/${id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't delete the post.");
        return;
      }
      toast.success("Post deleted.");
    } catch {
      toast.error("Couldn't delete the post. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Gate: locked state ────────────────────────────────────────────
  if (!gateOn) {
    return (
      <div className="space-y-6">
        <Header />
        <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Lock className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-base font-semibold">
            Social Planner is locked by your agency
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask your agency administrator to enable the Social Planner for this
            sub-account.
          </p>
        </div>
      </div>
    );
  }

  const sortedPosts = [...posts].sort((a, b) => {
    const da = toDate(a.scheduledAt)?.getTime() ?? toDate(a.createdAt)?.getTime() ?? 0;
    const dbb = toDate(b.scheduledAt)?.getTime() ?? toDate(b.createdAt)?.getTime() ?? 0;
    return dbb - da;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Header />
        {isAdmin && (
          <Button
            onClick={() => setComposerOpen(true)}
            disabled={!canPublish}
            title={
              canPublish
                ? "Compose a new post"
                : "Connect a Page with posting permission first (Connections tab)"
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            New post
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        <TabButton
          active={tab === "calendar"}
          onClick={() => setTab("calendar")}
          icon={<CalendarDays className="h-4 w-4" />}
          label="Calendar"
        />
        <TabButton
          active={tab === "connections"}
          onClick={() => setTab("connections")}
          icon={<Link2 className="h-4 w-4" />}
          label="Connections"
        />
      </div>

      {tab === "connections" ? (
        <SocialConnections />
      ) : !canPublish ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-700 dark:text-amber-400">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Posting isn&apos;t set up yet
          </p>
          <p className="mt-1">
            Head to the{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setTab("connections")}
            >
              Connections
            </button>{" "}
            tab to connect a Facebook Page with posting permission, then come
            back to schedule posts.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <SocialContentCalendar posts={posts} />

          {/* Post list */}
          <div>
            <h2 className="mb-2 text-sm font-semibold">All posts</h2>
            {!loaded ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : sortedPosts.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
                No posts yet. Click <strong>New post</strong> to schedule your
                first one.
              </div>
            ) : (
              <ul className="space-y-2">
                {sortedPosts.map((p) => {
                  const when = toDate(p.scheduledAt);
                  const failed = p.results?.filter((r) => r.status === "failed") ?? [];
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                              STATUS_BADGE[p.status],
                            )}
                          >
                            {p.status}
                          </span>
                          {p.targets.includes("facebook") && (
                            <Facebook className="h-3.5 w-3.5 text-blue-500" />
                          )}
                          {p.targets.includes("instagram") && (
                            <Instagram className="h-3.5 w-3.5 text-pink-500" />
                          )}
                          {when && (
                            <span className="text-[11px] text-muted-foreground">
                              {when.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-sm">
                          {p.caption || (
                            <span className="text-muted-foreground">
                              (no caption)
                            </span>
                          )}
                        </p>
                        {failed.length > 0 && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">
                            {failed
                              .map((r) => `${r.platform}: ${r.error}`)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      {isAdmin && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={deletingId !== null}
                          onClick={() => deletePost(p.id)}
                          title="Delete post"
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <SocialPostComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        subAccountId={subAccountId}
        canFacebook={canFacebook}
        canInstagram={canInstagram}
        pageName={cfg?.pageName ?? null}
        igUsername={cfg?.instagramUsername ?? null}
      />
    </div>
  );
}

function Header() {
  return (
    <div className="min-w-0">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <Share2 className="h-5 w-5" />
        Social Planner
        <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
          Beta
        </span>
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Schedule posts to your Facebook Page and Instagram. They publish
        automatically at the time you pick.
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, MessageCircle, Pin, ThumbsUp } from "lucide-react";
import type { AuthorView } from "@/types/community";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu } from "@/components/community/actions-menu";
import { AuthorLink } from "@/components/community/author-link";
import { cn } from "@/lib/utils";

export interface ClientPost {
  id: string;
  authorMemberId: string;
  title: string;
  body: string;
  category: string | null;
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  createdAtMs: number | null;
  author: AuthorView;
  likedByViewer: boolean;
}

interface Viewer {
  memberId: string;
  role: "member" | "moderator";
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

function timeAgo(ms: number | null): string {
  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(ms).toLocaleDateString();
}

export function FeedView({
  saId,
  groupId,
  groupSlug,
  brand,
  categories,
  viewer,
  initialPosts,
}: {
  saId: string;
  groupId: string;
  groupSlug: string;
  brand: string;
  categories: string[];
  viewer: Viewer;
  initialPosts: ClientPost[];
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState<string>("All");

  function prependPost(post: ClientPost) {
    setPosts((prev) => [post, ...prev]);
  }

  const base = `/api/community/${saId}/${groupId}`;
  const visible =
    filter === "All" ? posts : posts.filter((p) => p.category === filter);

  async function toggleLike(postId: string) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              likedByViewer: !p.likedByViewer,
              likeCount: p.likeCount + (p.likedByViewer ? -1 : 1),
            }
          : p,
      ),
    );
    try {
      const res = await fetch(`${base}/posts/${postId}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure.
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                likedByViewer: !p.likedByViewer,
                likeCount: p.likeCount + (p.likedByViewer ? 1 : -1),
              }
            : p,
        ),
      );
      toast.error("Couldn't update like");
    }
  }

  async function togglePin(postId: string, pinned: boolean) {
    const res = await fetch(`${base}/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    if (res.ok) {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, pinned: !pinned } : p)),
      );
    } else {
      toast.error("Couldn't update pin");
    }
  }

  async function deletePost(postId: string) {
    if (!confirm("Delete this post?")) return;
    const res = await fetch(`${base}/posts/${postId}`, { method: "DELETE" });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Post deleted");
    } else {
      toast.error("Couldn't delete");
    }
  }

  return (
    <div className="space-y-4">
      <Composer
        saId={saId}
        groupId={groupId}
        brand={brand}
        categories={categories}
        viewer={viewer}
        onCreated={prependPost}
      />

      <div className="flex flex-wrap gap-1.5">
        {["All", ...categories].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === c
                ? "border-transparent text-white"
                : "border-[#E4E4E4] bg-white text-[#909090] hover:text-[#202124]",
            )}
            style={filter === c ? { backgroundColor: brand } : undefined}
          >
            {c}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E4E4E4] bg-white p-10 text-center text-sm text-[#909090]">
          Nothing here yet. Be the first to post.
        </div>
      ) : (
        <div className="space-y-3">
          {[...visible]
            .sort((a, b) => Number(b.pinned) - Number(a.pinned))
            .map((p) => {
              const canModerate = viewer.role === "moderator";
              const canDelete =
                canModerate || p.authorMemberId === viewer.memberId;
              const detail = `/c/${saId}/${groupSlug}/community/${p.id}`;
              return (
                <article
                  key={p.id}
                  className="rounded-xl border border-[#E4E4E4] bg-white p-4"
                >
                  {p.pinned && (
                    <div className="mb-2 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[#909090]">
                      <Pin className="h-3 w-3" /> Pinned
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <MemberAvatar author={p.author} size={40} brand={brand} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <AuthorLink
                          saId={saId}
                          viewerMemberId={viewer.memberId}
                          author={p.author}
                          brand={brand}
                        />
                        <span className="text-xs text-[#909090]">
                          {timeAgo(p.createdAtMs)}
                        </span>
                        {p.category && (
                          <span className="text-xs text-[#909090]">
                            · {p.category}
                          </span>
                        )}
                      </div>
                      <Link href={detail} className="mt-1 block">
                        {p.title && (
                          <h3 className="font-semibold text-[#202124]">
                            {p.title}
                          </h3>
                        )}
                        <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-sm text-[#3a3a44]">
                          {p.body}
                        </p>
                      </Link>
                      <div className="mt-3 flex items-center gap-4 text-xs text-[#909090]">
                        <button
                          onClick={() => toggleLike(p.id)}
                          className="flex items-center gap-1 hover:text-[#202124]"
                        >
                          <ThumbsUp
                            className={cn("h-4 w-4", p.likedByViewer && "fill-current")}
                            style={p.likedByViewer ? { color: brand } : undefined}
                          />
                          {p.likeCount}
                        </button>
                        <Link
                          href={detail}
                          className="flex items-center gap-1 hover:text-[#202124]"
                        >
                          <MessageCircle className="h-4 w-4" />
                          {p.commentCount}
                        </Link>
                      </div>
                    </div>
                    {(canModerate || canDelete) && (
                      <ActionsMenu
                        items={[
                          ...(canModerate
                            ? [
                                {
                                  label: p.pinned ? "Unpin post" : "Pin post",
                                  onClick: () => togglePin(p.id, p.pinned),
                                },
                              ]
                            : []),
                          ...(canDelete
                            ? [
                                {
                                  label: "Delete post",
                                  onClick: () => deletePost(p.id),
                                  destructive: true,
                                },
                              ]
                            : []),
                        ]}
                      />
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      )}
    </div>
  );
}

function Composer({
  saId,
  groupId,
  brand,
  categories,
  viewer,
  onCreated,
}: {
  saId: string;
  groupId: string;
  brand: string;
  categories: string[];
  viewer: Viewer;
  onCreated: (post: ClientPost) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "General");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      toast.error("Write something first");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, body: trimmedBody, category }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        post?: { id: string };
      };
      if (!res.ok || !d.ok || !d.post?.id) {
        throw new Error(d.error ?? "Couldn't post");
      }
      // Optimistic: drop the real created post (we have its id) into the feed
      // immediately — no server round-trip / re-render to wait on.
      onCreated({
        id: d.post.id,
        authorMemberId: viewer.memberId,
        title: trimmedTitle,
        body: trimmedBody,
        category: categories.includes(category) ? category : null,
        pinned: false,
        likeCount: 0,
        commentCount: 0,
        createdAtMs: Date.now(),
        author: {
          memberId: viewer.memberId,
          displayName: viewer.displayName,
          avatarUrl: viewer.avatarUrl,
          level: viewer.level,
        },
        likedByViewer: false,
      });
      setTitle("");
      setBody("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't post");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-[#E4E4E4] bg-white p-4 text-left text-sm text-[#909090] hover:border-[#d4d4d4]"
      >
        Write something…
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#E4E4E4] bg-white p-4">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full border-0 p-0 text-base font-semibold text-[#202124] outline-none placeholder:text-[#b4b4b4]"
        autoFocus
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write something…"
        rows={4}
        className="mt-2 w-full resize-none border-0 p-0 text-sm text-[#3a3a44] outline-none placeholder:text-[#b4b4b4]"
      />
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f0f0f0] pt-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-[#E4E4E4] bg-white px-2 py-1 text-xs text-[#3a3a44]"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen(false)}
            disabled={saving}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[#909090] hover:text-[#202124]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Post
          </button>
        </div>
      </div>
    </div>
  );
}

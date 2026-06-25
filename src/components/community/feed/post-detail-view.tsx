"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessageCircle, ThumbsUp } from "lucide-react";
import type { AuthorView } from "@/types/community";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu, type MenuItem } from "@/components/community/actions-menu";
import { AuthorLink } from "@/components/community/author-link";
import { cn } from "@/lib/utils";
import type { ClientPost } from "./feed-view";

export interface ClientComment {
  id: string;
  body: string;
  likeCount: number;
  likedByViewer: boolean;
  createdAtMs: number | null;
  parentId: string | null;
  author: AuthorView;
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
  return `${Math.floor(h / 24)}d`;
}

export function PostDetailView({
  saId,
  groupId,
  groupSlug,
  brand,
  post,
  initialComments,
  viewer,
}: {
  saId: string;
  groupId: string;
  groupSlug: string;
  brand: string;
  post: ClientPost;
  initialComments: ClientComment[];
  viewer: Viewer;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.likedByViewer);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [pinned, setPinned] = useState(post.pinned);
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const base = `/api/community/${saId}/${groupId}`;

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  async function togglePostLike() {
    setLiked((v) => !v);
    setLikeCount((c) => c + (liked ? -1 : 1));
    try {
      const res = await fetch(`${base}/posts/${post.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setLiked((v) => !v);
      setLikeCount((c) => c + (liked ? 1 : -1));
    }
  }

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    const res = await fetch(`${base}/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    });
    if (!res.ok) {
      setPinned(!next);
      toast.error("Couldn't update pin");
    }
  }

  async function deletePost() {
    if (!confirm("Delete this post?")) return;
    const res = await fetch(`${base}/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Post deleted");
      router.push(`/c/${saId}/${groupSlug}/community`);
    } else {
      toast.error("Couldn't delete");
    }
  }

  async function toggleCommentLike(id: string) {
    setComments((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              likedByViewer: !c.likedByViewer,
              likeCount: c.likeCount + (c.likedByViewer ? -1 : 1),
            }
          : c,
      ),
    );
    try {
      const res = await fetch(`${base}/posts/${post.id}/comments/${id}/like`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
    } catch {
      router.refresh();
    }
  }

  async function deleteComment(id: string) {
    if (!confirm("Delete this comment?")) return;
    const prev = comments;
    // Remove the comment and any replies hanging off it.
    setComments((c) => c.filter((x) => x.id !== id && x.parentId !== id));
    try {
      const res = await fetch(`${base}/posts/${post.id}/comments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      setComments(prev);
      toast.error("Couldn't delete comment");
    }
  }

  async function postComment(body: string, parentId: string | null) {
    const res = await fetch(`${base}/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, parentId }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      comment?: { id: string };
    };
    if (!res.ok || !d.ok || !d.comment?.id) {
      throw new Error(d.error ?? "Couldn't comment");
    }
    // Optimistic: drop it straight in.
    setComments((prev) => [
      ...prev,
      {
        id: d.comment!.id,
        body,
        likeCount: 0,
        likedByViewer: false,
        createdAtMs: Date.now(),
        parentId,
        author: {
          memberId: viewer.memberId,
          displayName: viewer.displayName,
          avatarUrl: viewer.avatarUrl,
          level: viewer.level,
        },
      },
    ]);
  }

  async function submitComment() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await postComment(draft.trim(), null);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't comment");
    } finally {
      setSaving(false);
    }
  }

  async function submitReply(parentId: string) {
    if (!replyDraft.trim()) return;
    setReplySaving(true);
    try {
      await postComment(replyDraft.trim(), parentId);
      setReplyDraft("");
      setReplyingTo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reply");
    } finally {
      setReplySaving(false);
    }
  }

  const canModerate = viewer.role === "moderator";
  const postMenu: MenuItem[] = [
    ...(canModerate
      ? [{ label: pinned ? "Unpin post" : "Pin post", onClick: togglePin }]
      : []),
    ...(canModerate || post.author.memberId === viewer.memberId
      ? [{ label: "Delete post", onClick: deletePost, destructive: true }]
      : []),
  ];

  return (
    <div className="space-y-4">
      {/* Post */}
      <article className="rounded-xl border border-[#E4E4E4] bg-white p-5">
        <div className="flex items-start gap-3">
          <MemberAvatar author={post.author} size={44} brand={brand} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <AuthorLink
                saId={saId}
                viewerMemberId={viewer.memberId}
                author={post.author}
                brand={brand}
              />
              <span className="text-xs text-[#909090]">
                {timeAgo(post.createdAtMs)}
              </span>
              {post.category && (
                <span className="text-xs text-[#909090]">· {post.category}</span>
              )}
            </div>
            {post.title && (
              <h1 className="mt-1 text-lg font-semibold text-[#202124]">
                {post.title}
              </h1>
            )}
            <p className="mt-1 whitespace-pre-wrap text-sm text-[#3a3a44]">
              {post.body}
            </p>
            <div className="mt-3 flex items-center gap-2 border-t border-[#f0f0f0] pt-3 text-sm">
              <button
                onClick={togglePostLike}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border border-[#E4E4E4] px-2.5 py-1 text-xs font-medium hover:bg-[#F8F7F5]",
                  liked ? "text-[#202124]" : "text-[#909090]",
                )}
              >
                <ThumbsUp
                  className={cn("h-4 w-4", liked && "fill-current")}
                  style={liked ? { color: brand } : undefined}
                />
                {liked ? "Liked" : "Like"}
                {likeCount > 0 && (
                  <span className="font-semibold">{likeCount}</span>
                )}
              </button>
              <span className="flex items-center gap-1.5 px-1 text-xs text-[#909090]">
                <MessageCircle className="h-4 w-4" />
                {comments.length}{" "}
                {comments.length === 1 ? "comment" : "comments"}
              </span>
            </div>
          </div>
          {postMenu.length > 0 && <ActionsMenu items={postMenu} />}
        </div>
      </article>

      {/* Thread */}
      <div className="space-y-3">
        {topLevel.map((c) => (
          <div key={c.id} className="space-y-2">
            <CommentBubble
              saId={saId}
              comment={c}
              viewer={viewer}
              brand={brand}
              onLike={toggleCommentLike}
              onReply={() => {
                setReplyingTo(replyingTo === c.id ? null : c.id);
                setReplyDraft("");
              }}
              onDelete={deleteComment}
            />
            {repliesOf(c.id).map((r) => (
              <CommentBubble
                key={r.id}
                saId={saId}
                comment={r}
                viewer={viewer}
                brand={brand}
                indented
                onLike={toggleCommentLike}
                onReply={() => {
                  setReplyingTo(c.id);
                  setReplyDraft("");
                }}
                onDelete={deleteComment}
              />
            ))}
            {replyingTo === c.id && (
              <div className="ml-11 flex gap-2">
                <textarea
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  placeholder="Write a reply…"
                  rows={1}
                  autoFocus
                  className="flex-1 resize-none rounded-md border border-[#E4E4E4] bg-white p-2 text-sm text-[#3a3a44] outline-none placeholder:text-[#909090]"
                />
                <button
                  onClick={() => submitReply(c.id)}
                  disabled={replySaving}
                  className="self-end rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: brand }}
                >
                  {replySaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Reply"
                  )}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Comment composer (bottom, Skool-style) */}
      <div className="flex items-start gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a comment…"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-[#E4E4E4] bg-white px-3 py-2.5 text-sm text-[#3a3a44] outline-none placeholder:text-[#909090]"
        />
        <button
          onClick={submitComment}
          disabled={saving}
          className="rounded-md px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: brand }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Comment"}
        </button>
      </div>
    </div>
  );
}

function CommentBubble({
  saId,
  comment,
  viewer,
  brand,
  indented,
  onLike,
  onReply,
  onDelete,
}: {
  saId: string;
  comment: ClientComment;
  viewer: Viewer;
  brand: string;
  indented?: boolean;
  onLike: (id: string) => void;
  onReply: () => void;
  onDelete: (id: string) => void;
}) {
  const canDelete =
    viewer.role === "moderator" || comment.author.memberId === viewer.memberId;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-[#E4E4E4] bg-white p-4",
        indented && "ml-8",
      )}
    >
      <MemberAvatar author={comment.author} size={indented ? 28 : 32} brand={brand} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <AuthorLink
            saId={saId}
            viewerMemberId={viewer.memberId}
            author={comment.author}
            brand={brand}
          />
          <span className="text-xs text-[#909090]">
            {timeAgo(comment.createdAtMs)}
          </span>
          {canDelete && (
            <div className="ml-auto">
              <ActionsMenu
                items={[
                  {
                    label: "Delete",
                    onClick: () => onDelete(comment.id),
                    destructive: true,
                  },
                ]}
              />
            </div>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm text-[#3a3a44]">
          {comment.body}
        </p>
        <div className="mt-1.5 flex items-center gap-4 text-xs text-[#909090]">
          <button
            onClick={() => onLike(comment.id)}
            className="flex items-center gap-1 hover:text-[#202124]"
          >
            <ThumbsUp
              className={cn("h-3.5 w-3.5", comment.likedByViewer && "fill-current")}
              style={comment.likedByViewer ? { color: brand } : undefined}
            />
            {comment.likeCount}
          </button>
          <button onClick={onReply} className="font-medium hover:text-[#202124]">
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

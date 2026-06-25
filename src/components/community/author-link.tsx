"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import type { AuthorView } from "@/types/community";
import { MemberAvatar } from "@/components/community/member-avatar";

/**
 * Clickable author name that opens a Skool-style profile popover (avatar, name,
 * level, bio) with a Message button. Used on feed posts, comments, etc. Bio is
 * lazy-loaded on first open. Same-group is guaranteed in feed context (both are
 * members of the group), so the Message button shows for anyone but yourself.
 */
export function AuthorLink({
  saId,
  viewerMemberId,
  author,
  brand,
  className,
}: {
  saId: string;
  viewerMemberId: string;
  author: AuthorView;
  brand: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [bio, setBio] = useState<string | null>(null);
  const isSelf = author.memberId === viewerMemberId;
  const threadId = [viewerMemberId, author.memberId].sort().join("__");

  async function load() {
    if (bio !== null) return;
    try {
      const res = await fetch(
        `/api/community/${saId}/member-card/${author.memberId}`,
      );
      const d = (await res.json().catch(() => ({}))) as {
        card?: { bio?: string };
      };
      setBio(d.card?.bio ?? "");
    } catch {
      setBio("");
    }
  }

  return (
    <span className="relative inline-block">
      <button
        onClick={() => {
          setOpen((o) => !o);
          void load();
        }}
        className={className ?? "font-medium text-[#202124] hover:underline"}
      >
        {author.displayName}
      </button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-20 cursor-default"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-[#E4E4E4] bg-white p-4 text-left shadow-lg">
            <div className="flex items-center gap-3">
              <MemberAvatar author={author} size={44} brand={brand} />
              <div className="min-w-0">
                <div className="truncate font-semibold text-[#202124]">
                  {author.displayName}
                </div>
                <div className="text-xs text-[#909090]">
                  Level {author.level}
                </div>
              </div>
            </div>
            {bio ? (
              <p className="mt-3 line-clamp-4 text-sm text-[#3a3a44]">{bio}</p>
            ) : null}
            {!isSelf && (
              <Link
                href={`/c/${saId}/messages/${threadId}`}
                className="mt-3 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                <MessageSquare className="h-4 w-4" /> Message
              </Link>
            )}
          </div>
        </>
      )}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bookmark,
  Facebook,
  Heart,
  ImageIcon,
  Instagram,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Send,
  ThumbsUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SOCIAL_CAPTION_MAX } from "@/types/social";

/**
 * Compose a social post — caption + optional image URL + platform targets +
 * schedule, with a live platform-styled preview. v1 takes a pasted https
 * image URL (no upload); Instagram requires one. Posts to
 * /api/sub-accounts/[id]/social/posts as a draft or scheduled.
 *
 * The preview is purely client-side (renders the caption + image in mock FB/IG
 * chrome) — no Meta call — so the composer is fully testable without a
 * connected account.
 */
export function SocialPostComposer({
  open,
  onOpenChange,
  subAccountId,
  canFacebook,
  canInstagram,
  pageName,
  igUsername,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subAccountId: string;
  canFacebook: boolean;
  canInstagram: boolean;
  pageName?: string | null;
  igUsername?: string | null;
  onCreated?: () => void;
}) {
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [toFacebook, setToFacebook] = useState(canFacebook);
  const [toInstagram, setToInstagram] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState<"draft" | "schedule" | null>(null);

  function reset() {
    setCaption("");
    setImageUrl("");
    setToFacebook(canFacebook);
    setToInstagram(false);
    setScheduledAt("");
  }

  async function submit(mode: "draft" | "schedule") {
    const targets: string[] = [];
    if (toFacebook) targets.push("facebook");
    if (toInstagram) targets.push("instagram");

    if (mode === "schedule") {
      if (!caption.trim() && !imageUrl.trim()) {
        toast.error("Add a caption or an image first.");
        return;
      }
      if (targets.length === 0) {
        toast.error("Pick at least one platform.");
        return;
      }
      if (targets.includes("instagram") && !imageUrl.trim()) {
        toast.error("Instagram posts need an image URL.");
        return;
      }
      if (!scheduledAt) {
        toast.error("Pick a date and time to schedule.");
        return;
      }
    }

    setSaving(mode);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/social/posts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caption: caption.trim(),
            imageUrl: imageUrl.trim() || null,
            targets,
            status: mode === "schedule" ? "scheduled" : "draft",
            scheduledAt:
              mode === "schedule" && scheduledAt
                ? new Date(scheduledAt).toISOString()
                : null,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't save the post.");
        return;
      }
      toast.success(mode === "schedule" ? "Post scheduled." : "Draft saved.");
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch {
      toast.error("Couldn't save the post. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New post</DialogTitle>
          <DialogDescription>
            Schedule a post to your connected Facebook Page and Instagram. It
            publishes automatically at the time you pick.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          {/* ── Form ────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sp-caption">Caption</Label>
              <Textarea
                id="sp-caption"
                rows={5}
                value={caption}
                maxLength={SOCIAL_CAPTION_MAX}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="What do you want to share?"
              />
              <p className="text-right text-[11px] text-muted-foreground">
                {caption.length}/{SOCIAL_CAPTION_MAX}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-image">Image URL (https)</Label>
              <Input
                id="sp-image"
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
              />
              <p className="text-[11px] text-muted-foreground">
                Optional for Facebook. Required for Instagram. Must be a public
                https URL (uploads come in a later update).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Publish to</Label>
              <div className="flex flex-col gap-2">
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm",
                    !canFacebook && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={toFacebook}
                    disabled={!canFacebook}
                    onChange={(e) => setToFacebook(e.target.checked)}
                  />
                  <Facebook className="h-4 w-4 text-blue-500" />
                  Facebook Page
                  {!canFacebook && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      Connect a Page first
                    </span>
                  )}
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm",
                    !canInstagram && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={toInstagram}
                    disabled={!canInstagram}
                    onChange={(e) => setToInstagram(e.target.checked)}
                  />
                  <Instagram className="h-4 w-4 text-pink-500" />
                  Instagram
                  {!canInstagram && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      No IG account linked
                    </span>
                  )}
                </label>
              </div>
            </div>

            {/* Post type — v1 ships Feed only; Reel/Story are roadmap. */}
            <div className="space-y-1.5">
              <Label>Post type</Label>
              <div className="inline-flex rounded-lg border p-0.5 text-xs">
                <span className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground">
                  Feed
                </span>
                <span className="px-3 py-1 text-muted-foreground/50">
                  Reel · soon
                </span>
                <span className="px-3 py-1 text-muted-foreground/50">
                  Story · soon
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-when">Schedule for</Label>
              <Input
                id="sp-when"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to keep it as a draft.
              </p>
            </div>
          </div>

          {/* ── Live preview ────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="space-y-4 rounded-xl bg-muted/30 p-3">
              {!toFacebook && !toInstagram && (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  Pick a platform to see a preview.
                </p>
              )}
              {toFacebook && (
                <FacebookPreview
                  caption={caption}
                  imageUrl={imageUrl}
                  pageName={pageName}
                />
              )}
              {toInstagram && (
                <InstagramPreview
                  caption={caption}
                  imageUrl={imageUrl}
                  igUsername={igUsername}
                />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Approximate — exact rendering varies by platform.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving !== null}
            onClick={() => submit("draft")}
          >
            {saving === "draft" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Save draft
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving !== null}
            onClick={() => submit("schedule")}
          >
            {saving === "schedule" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Image with broken-URL fallback. Resets its error state when the URL changes. */
function PreviewImage({
  url,
  square,
}: {
  url: string;
  square?: boolean;
}) {
  const [err, setErr] = useState(false);
  useEffect(() => setErr(false), [url]);
  const box = square ? "aspect-square" : "aspect-video";

  if (!url.trim() || err) {
    return (
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground",
          box,
        )}
      >
        <ImageIcon className="h-6 w-6" />
        <span className="text-[11px]">
          {url.trim() ? "Image couldn't load" : "Image preview"}
        </span>
      </div>
    );
  }
  return (
    // Arbitrary external image URL — Next/Image needs a configured loader/host
    // allowlist, which we can't predict for tenant-pasted URLs.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      onError={() => setErr(true)}
      className={cn("w-full object-cover", box)}
    />
  );
}

function Avatar({ label }: { label: string }) {
  const initial = label.trim().charAt(0).toUpperCase() || "•";
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted-foreground/20 text-xs font-semibold text-muted-foreground">
      {initial}
    </span>
  );
}

function FacebookPreview({
  caption,
  imageUrl,
  pageName,
}: {
  caption: string;
  imageUrl: string;
  pageName?: string | null;
}) {
  const name = pageName?.trim() || "Your Page";
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-2 p-3">
        <Avatar label={name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-muted-foreground">Just now · 🌐</p>
        </div>
        <MoreHorizontal className="ml-auto h-4 w-4 text-muted-foreground" />
      </div>
      {caption.trim() ? (
        <p className="whitespace-pre-wrap px-3 pb-2 text-sm">{caption}</p>
      ) : (
        <p className="px-3 pb-2 text-sm text-muted-foreground">
          Your caption will appear here…
        </p>
      )}
      {imageUrl.trim() && <PreviewImage url={imageUrl} />}
      <div className="flex items-center justify-around border-t py-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <ThumbsUp className="h-3.5 w-3.5" /> Like
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="h-3.5 w-3.5" /> Comment
        </span>
        <span className="flex items-center gap-1">
          <Send className="h-3.5 w-3.5" /> Share
        </span>
      </div>
    </div>
  );
}

function InstagramPreview({
  caption,
  imageUrl,
  igUsername,
}: {
  caption: string;
  imageUrl: string;
  igUsername?: string | null;
}) {
  const handle = igUsername?.trim() || "your_handle";
  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center gap-2 p-3">
        <Avatar label={handle} />
        <p className="min-w-0 truncate text-sm font-semibold">{handle}</p>
        <MoreHorizontal className="ml-auto h-4 w-4 text-muted-foreground" />
      </div>
      <PreviewImage url={imageUrl} square />
      <div className="flex items-center gap-3 px-3 pt-2 text-muted-foreground">
        <Heart className="h-4 w-4" />
        <MessageCircle className="h-4 w-4" />
        <Send className="h-4 w-4" />
        <Bookmark className="ml-auto h-4 w-4" />
      </div>
      <p className="px-3 pb-3 pt-2 text-sm">
        <span className="font-semibold">{handle}</span>{" "}
        {caption.trim() ? (
          <span className="whitespace-pre-wrap">{caption}</span>
        ) : (
          <span className="text-muted-foreground">
            your caption will appear here…
          </span>
        )}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  GraduationCap,
  Loader2,
  Lock,
  Plus,
  ExternalLink,
  Users,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { ABOUT_MAX_CHARS } from "@/config/community";
import { subscribeToCommunityGroups } from "@/lib/firestore/community-groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { CommunityGroup } from "@/types/community";

/**
 * Community groups — staff list + create. Gated by `communityEnabledByAgency`;
 * renders a locked state when the agency hasn't enabled it. Each group links
 * to its settings + its public `/c/[saId]/[slug]` landing page.
 */
export default function CommunityPage() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [groups, setGroups] = useState<CommunityGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const gateOn = subAccount?.communityEnabledByAgency === true;

  useEffect(() => {
    if (!gateOn) {
      setLoaded(true);
      return;
    }
    return subscribeToCommunityGroups(
      subAccountId,
      (list) => {
        setGroups(
          [...list].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [subAccountId, gateOn]);

  if (!gateOn) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Community is locked</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Your agency administrator hasn&apos;t enabled Community for this
            sub-account yet. Ask them to switch it on from Manage in the agency
            sub-accounts list.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <GraduationCap className="h-6 w-6" />
            Community
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Skool-style groups — a feed, courses, and a leaderboard your members
            access at a branded public link.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New group
          </Button>
        )}
      </div>

      {!loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No groups yet.{" "}
            {isAdmin
              ? "Create your first community group to get started."
              : "Ask an admin to create one."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} subAccountId={subAccountId} />
          ))}
        </div>
      )}

      <CreateGroupDialog
        subAccountId={subAccountId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

/** Skool-style group card: cover image (or brand-tinted initial placeholder)
 *  above name + status, description, and a member-count / price / View row. */
function GroupCard({
  group: g,
  subAccountId,
}: {
  group: CommunityGroup;
  subAccountId: string;
}) {
  const image = g.cardImageUrl ?? g.coverUrl;
  const brand = g.brandColor || "#6b7280";
  const price =
    g.access === "paid"
      ? g.priceCents != null
        ? formatCurrency(g.priceCents / 100, g.currency ?? "USD")
        : "Paid"
      : "Free";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <Link
        href={`/sa/${subAccountId}/community/${g.id}`}
        className="block"
        aria-label={`Open ${g.name}`}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div
            className="flex aspect-video w-full items-center justify-center text-3xl font-semibold text-white"
            style={{ backgroundColor: brand }}
          >
            {g.name.charAt(0).toUpperCase()}
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/sa/${subAccountId}/community/${g.id}`}
            className="font-medium hover:underline"
          >
            {g.name}
          </Link>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              g.status === "published"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
            )}
          >
            {g.status}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {g.about || "No description yet."}
        </p>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {g.memberCount}
          </span>
          <span>{price}</span>
          <a
            href={`/c/${subAccountId}/${g.slug}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto flex items-center gap-1 hover:text-foreground"
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function CreateGroupDialog({
  subAccountId,
  open,
  onOpenChange,
}: {
  subAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Enter a group name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/community`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), about: about.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to create");
      toast.success("Group created as a draft. Publish it when you're ready.");
      setName("");
      setAbout("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New community group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Inner Circle"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-about">About (optional)</Label>
            <Textarea
              id="group-about"
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, ABOUT_MAX_CHARS))}
              maxLength={ABOUT_MAX_CHARS}
              placeholder="What is this community about? You can edit this later."
              rows={4}
            />
            <p className="text-right text-xs text-muted-foreground">
              {about.length}/{ABOUT_MAX_CHARS}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              "Create group"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

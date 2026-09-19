"use client";

import { useState } from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Says the sample records on this screen are an example, and offers the way
 * out of them.
 *
 * Every new workspace is seeded with a worked example (see
 * `lib/seed/sample-workspace.ts`) so a first-time agent opens the pipeline to
 * something legible rather than six empty columns. That trade only holds if
 * the example is removable: a client who has started working for real should
 * not have to pick five invented contacts out of their own list one at a time,
 * and until this existed the only way to clear them was to call the API by
 * hand — which is to say, there was none.
 *
 * Two things this deliberately does NOT do.
 *
 * It does not hide itself once dismissed. There is no "don't show again",
 * because the notice is the only place the records are identified as fake;
 * dismissing it would leave fictional contacts in a real list with nothing
 * saying so.
 *
 * It does not offer the button to collaborators. Removal is admin-only on the
 * route, so showing a button that 403s would be worse than showing none — it
 * names who can do it instead.
 */

interface SampleDataNoticeProps {
  subAccountId: string;
  /** How many sample records are on THIS screen. Zero renders nothing. */
  count: number;
  /**
   * What the reader is looking at — "contacts", "deals". Used in the sentence
   * so the notice names the thing on screen rather than saying "records".
   */
  noun: string;
  /** Whether the caller may remove them. Non-admins are told who can. */
  canRemove: boolean;
}

export function SampleDataNotice({
  subAccountId,
  count,
  noun,
  canRemove,
}: SampleDataNoticeProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (count < 1) return null;

  const handleRemove = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/sample-data`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(
          data?.error ?? "Could not remove the sample data. Try again."
        );
        return;
      }
      // The lists on screen are onSnapshot-driven, so they empty themselves —
      // nothing to refresh here.
      const removed = data?.removed;
      toast.success(
        removed
          ? `Removed ${removed.contacts} sample contacts and ${removed.deals} sample deals.`
          : "Sample data removed."
      );
      setConfirmOpen(false);
    } catch {
      toast.error("Could not remove the sample data. Check your connection.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
        <Sparkles
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-muted-foreground">
          <span className="font-medium text-foreground">
            {count} of these {noun} are a sample
          </span>{" "}
          — a worked example to show you how this screen works. They are not
          real people, and nothing is ever sent to them.
        </p>
        {canRemove ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            Remove sample data
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            An admin on this workspace can remove them.
          </span>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md" data-testid="confirm-remove">
          <DialogHeader>
            <DialogTitle>Remove the sample data?</DialogTitle>
            <DialogDescription>
              This deletes every sample contact and deal in this workspace, and
              the example conversation that goes with them.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Anything you created yourself is untouched — only records marked as
            samples are removed. You can bring the example back later from the
            empty screen it leaves behind.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={removing}
            >
              Keep it for now
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removing}
            >
              {removing ? "Removing…" : "Remove sample data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Puts the worked example into a workspace that hasn't got one.
 *
 * Lives on the empty state of People and Deals — the exact screen where an
 * example is worth having, and the screen the removal leaves behind. Two
 * cases reach it:
 *
 *   - Someone removed the example and wants it back. The removal dialog says
 *     they can, so something has to make that true.
 *   - A workspace created BEFORE the seeder existed, which otherwise can
 *     never receive the example at all — seeding only runs at creation. Every
 *     workspace made before this shipped is in that position, and without
 *     this there is no way in.
 *
 * Admin-only, matching the route. A non-admin sees nothing rather than a
 * button that 403s.
 */
export function ShowExampleButton({
  subAccountId,
  canSeed,
}: {
  subAccountId: string;
  canSeed: boolean;
}) {
  const [working, setWorking] = useState(false);

  if (!canSeed) return null;

  const handleSeed = async () => {
    setWorking(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/sample-data`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "Could not add the example. Try again.");
        return;
      }
      // onSnapshot fills the screen in — nothing to refresh.
      toast.success("Added a sample pipeline you can play with.");
    } catch {
      toast.error("Could not add the example. Check your connection.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleSeed} disabled={working}>
      <Wand2 className="mr-1 h-4 w-4" />
      {working ? "Adding…" : "Show me an example"}
    </Button>
  );
}

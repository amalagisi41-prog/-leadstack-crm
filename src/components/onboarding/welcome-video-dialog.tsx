"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { AutoplayVideo } from "@/components/onboarding/autoplay-video";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { WELCOME_VIDEO } from "@/lib/onboarding/setup-progress";

const seenKey = (subAccountId: string) => `as-welcome-seen:${subAccountId}`;

function readSeen(subAccountId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(subAccountId)) === "1";
  } catch {
    return false;
  }
}

function writeSeen(subAccountId: string) {
  try {
    window.localStorage.setItem(seenKey(subAccountId), "1");
  } catch {
    // Private mode / blocked storage: the tour just shows again next visit.
  }
}

/**
 * Zack's welcome tour, autoplayed in a pop-up when a realtor lands on Setup,
 * before any setup step. It keeps coming back on every Setup visit until the
 * tour has actually been watched to the end — skipping only gets them past it
 * for now. Closing it hands off to the first open setup step.
 */
export function WelcomeVideoDialog({
  subAccountId,
  enabled,
  onDone,
}: {
  subAccountId: string;
  /** Setup still has steps left; finished workspaces never see the pop-up. */
  enabled: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (enabled && !readSeen(subAccountId)) setOpen(true);
  }, [enabled, subAccountId]);

  function finished() {
    writeSeen(subAccountId);
    setEnded(true);
  }

  function close() {
    setOpen(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogTitle className="text-lg">Welcome to AgentStack</DialogTitle>
        <DialogDescription>
          Zack&apos;s 2-minute tour of everything you just unlocked. Your setup
          starts right after.
        </DialogDescription>
        {open ? <AutoplayVideo src={WELCOME_VIDEO} onEnded={finished} /> : null}
        <div className="flex items-center justify-between gap-2">
          {ended ? (
            <span />
          ) : (
            <Button variant="ghost" size="sm" onClick={close}>
              Skip for now
            </Button>
          )}
          <Button size="sm" onClick={close}>
            Start setup <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

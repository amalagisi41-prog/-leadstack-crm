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
import { useAuth } from "@/hooks/use-auth";
import { canAutoOpenOnboardingPrompt } from "@/lib/onboarding/prompt-gate";
import {
  markPromptDismissed,
  markPromptShownThisSession,
  readPromptGate,
} from "@/lib/onboarding/prompt-gate-storage";

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
 * before any setup step. It goes through the onboarding prompt gate: it opens
 * on its own at most once per session (and counts as that session's one
 * onboarding modal), and closing it without finishing means "not now" for 7
 * days. Watching it to the end retires it for good on this device. Closing it
 * hands off to the first open setup step. The tour is always rewatchable from
 * the Setup page.
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
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [open, setOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [videoUnavailable, setVideoUnavailable] = useState(false);

  useEffect(() => {
    if (!enabled || !uid || readSeen(subAccountId)) return;
    let cancelled = false;
    void readPromptGate(uid).then((gate) => {
      if (cancelled || !canAutoOpenOnboardingPrompt(gate, Date.now())) return;
      markPromptShownThisSession(uid);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, uid, subAccountId]);

  function finished() {
    writeSeen(subAccountId);
    setEnded(true);
  }

  function close() {
    if (!ended && uid) void markPromptDismissed(uid);
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
        {open && !videoUnavailable ? (
          <AutoplayVideo
            src={WELCOME_VIDEO}
            onEnded={finished}
            onUnavailable={() => setVideoUnavailable(true)}
          />
        ) : null}
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

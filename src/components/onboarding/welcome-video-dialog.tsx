"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Volume2 } from "lucide-react";
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
 * Zack's welcome tour, autoplayed in a pop-up the first time a realtor lands
 * on Setup, before any setup step. Browsers block autoplay with sound unless
 * the page already had a click, so it falls back to muted playback with a
 * "Turn on sound" button rather than sitting on a frozen first frame.
 * Closing it (skip or finish) hands off to the first open setup step.
 */
export function WelcomeVideoDialog({
  subAccountId,
  enabled,
  onDone,
}: {
  subAccountId: string;
  /** Only new workspaces get the auto pop-up (identity step not done yet). */
  enabled: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ended, setEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (enabled && !readSeen(subAccountId)) setOpen(true);
  }, [enabled, subAccountId]);

  // Stable so React attaches it once; a fresh callback every render would
  // re-run play() and restart the tour.
  const startPlayback = useCallback((video: HTMLVideoElement | null) => {
    if (!video) return;
    videoRef.current = video;
    video.muted = false;
    video.play().catch(() => {
      video.muted = true;
      setMuted(true);
      void video.play().catch(() => undefined);
    });
  }, []);

  function unmute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    void video.play().catch(() => undefined);
  }

  function close() {
    writeSeen(subAccountId);
    videoRef.current?.pause();
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
        <div className="relative">
          <video
            ref={startPlayback}
            src={WELCOME_VIDEO}
            controls
            playsInline
            onEnded={() => setEnded(true)}
            className="w-full rounded-xl border bg-black"
          />
          {muted ? (
            <Button
              size="sm"
              onClick={unmute}
              className="absolute top-3 right-3 shadow"
            >
              <Volume2 className="mr-1.5 h-3.5 w-3.5" /> Turn on sound
            </Button>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            {ended ? "Close" : "Skip the tour"}
          </Button>
          <Button size="sm" onClick={close}>
            Start setup <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

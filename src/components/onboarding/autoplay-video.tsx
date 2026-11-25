"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** How long a video may take to report its duration before it is given up on. */
export const VIDEO_LOAD_TIMEOUT_MS = 8000;

/**
 * Zack video that starts playing the moment it mounts. Browsers block
 * autoplay with sound unless the page already had a click, so it falls back
 * to muted playback with a "Turn on sound" button rather than sitting on a
 * frozen first frame.
 *
 * A video that errors, or has not loaded its metadata within
 * VIDEO_LOAD_TIMEOUT_MS, removes itself (renders nothing) and calls
 * `onUnavailable`. A black area with a spinner and "--:--" that never
 * resolves is never shown.
 */
export function AutoplayVideo({
  src,
  onEnded,
  onUnavailable,
  className,
}: {
  src: string;
  onEnded?: () => void;
  onUnavailable?: () => void;
  className?: string;
}) {
  const [muted, setMuted] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const giveUp = useCallback(() => {
    setUnavailable(true);
    onUnavailable?.();
  }, [onUnavailable]);

  useEffect(() => {
    if (loaded || unavailable) return;
    const timer = window.setTimeout(giveUp, VIDEO_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, unavailable, giveUp]);

  // Stable so React attaches it once; a fresh callback every render would
  // re-run play() and restart the video.
  const startPlayback = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    if (!video) return;
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

  if (unavailable) return null;

  return (
    <div className="relative">
      <video
        ref={startPlayback}
        src={src}
        controls
        playsInline
        preload="auto"
        onLoadedMetadata={() => setLoaded(true)}
        onError={giveUp}
        onEnded={onEnded}
        className={cn("w-full rounded-xl border bg-black", className)}
      />
      {muted ? (
        <Button size="sm" onClick={unmute} className="absolute top-3 right-3 shadow">
          <Volume2 className="mr-1.5 h-3.5 w-3.5" /> Turn on sound
        </Button>
      ) : null}
    </div>
  );
}

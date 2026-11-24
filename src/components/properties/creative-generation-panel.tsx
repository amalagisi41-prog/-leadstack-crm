"use client";

import { useState } from "react";
import { Loader2, Sparkles, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type AssetStatus = "queued" | "processing" | "ready" | "failed";

interface VideoState {
  status: AssetStatus;
  videoUrl: string | null;
  error: string | null;
}

interface ImageState {
  status: AssetStatus;
  imageUrl: string | null;
  error: string | null;
}

/**
 * Entry point for the two creative connectors — Creatify (listing.campaign.video)
 * and Placid (listing.campaign.image). Lives on the property workspace's
 * Assets tab, next to the photos it draws from. Both actions require a
 * photo on the brief; Placid additionally needs a template id set once in
 * Settings (PATCH /creative-config).
 */
export function CreativeGenerationPanel({
  subAccountId,
  listingId,
  photoUrl,
  initialVideo,
  initialImage,
}: {
  subAccountId: string;
  listingId: string;
  photoUrl: string | undefined;
  initialVideo: VideoState | null | undefined;
  initialImage: ImageState | null | undefined;
}) {
  const [video, setVideo] = useState<VideoState | null>(initialVideo ?? null);
  const [image, setImage] = useState<ImageState | null>(initialImage ?? null);
  const [startingVideo, setStartingVideo] = useState(false);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [generatingFinal, setGeneratingFinal] = useState(false);

  const base = `/api/sub-accounts/${subAccountId}/marketing/campaigns/${listingId}`;

  async function startVideo() {
    setStartingVideo(true);
    try {
      const res = await fetch(`${base}/video`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not start video generation.");
      setVideo({ status: "queued", videoUrl: null, error: null });
      toast.success("Video generation started — check back in a minute.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start video generation.");
    } finally {
      setStartingVideo(false);
    }
  }

  async function checkVideo() {
    setCheckingVideo(true);
    try {
      const res = await fetch(`${base}/video/poll`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        video?: VideoState;
        error?: string;
      };
      if (!res.ok || !data.video) throw new Error(data.error ?? "Could not check video status.");
      setVideo(data.video);
      if (data.video.status === "ready") toast.success("Video is ready.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check video status.");
    } finally {
      setCheckingVideo(false);
    }
  }

  async function generateImage(test: boolean) {
    const setLoading = test ? setGeneratingPreview : setGeneratingFinal;
    setLoading(true);
    try {
      const res = await fetch(`${base}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        creativeImage?: ImageState;
        error?: string;
      };
      if (!res.ok || !data.creativeImage) throw new Error(data.error ?? "Could not generate the image.");
      setImage(data.creativeImage);
      if (data.creativeImage.status === "ready") {
        toast.success(test ? "Preview ready (watermarked)." : "Final image ready.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate the image.");
    } finally {
      setLoading(false);
    }
  }

  if (!photoUrl) return null;

  return (
    <section className="bg-card rounded-2xl border p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-semibold">Generate creative</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Turns this listing&apos;s own photo into a short video (Creatify) or
            fills it into your branded template (Placid). Both need a human
            approval before anything publishes.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Video className="h-3.5 w-3.5" /> Video
          </p>
          {video?.status === "ready" && video.videoUrl ? (
            <video src={video.videoUrl} controls className="mt-2 w-full rounded-lg" />
          ) : video?.status === "failed" ? (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
              {video.error ?? "Video generation failed."}
            </p>
          ) : video?.status === "queued" || video?.status === "processing" ? (
            <p className="mt-2 text-xs text-muted-foreground">Generating…</p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Not generated yet.</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={startVideo} disabled={startingVideo}>
              {startingVideo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {video ? "Regenerate" : "Generate"}
            </Button>
            {video && video.status !== "ready" && video.status !== "failed" ? (
              <Button size="sm" variant="ghost" onClick={checkVideo} disabled={checkingVideo}>
                {checkingVideo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Check status
              </Button>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-3.5 w-3.5" /> Branded image
          </p>
          {image?.status === "ready" && image.imageUrl ? (
            <img src={image.imageUrl} alt="Generated listing creative" className="mt-2 w-full rounded-lg border" />
          ) : image?.status === "failed" ? (
            <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
              {image.error ?? "Image generation failed."}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Not generated yet.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void generateImage(true)}
              disabled={generatingPreview}
            >
              {generatingPreview ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Preview (free)
            </Button>
            <Button
              size="sm"
              onClick={() => void generateImage(false)}
              disabled={generatingFinal}
            >
              {generatingFinal ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Generate final
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

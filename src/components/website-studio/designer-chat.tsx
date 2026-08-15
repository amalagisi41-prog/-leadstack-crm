"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AgentSiteContent, DesignerTurn } from "@/types/agent-site";

/** Local transcript entry: server turns plus an optional client-only image. */
type ChatTurn = DesignerTurn & { image?: string };

/**
 * Downscale + re-encode a screenshot so uploads stay small enough for the
 * serverless request limit while keeping enough detail for the model to
 * read layout, copy, and style.
 */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new window.Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("That file isn't a readable image."));
    el.src = dataUrl;
  });
  const MAX_EDGE = 1600;
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * The AI Designer interview panel. Sends each answer to the designer API,
 * which returns the next question + applies content updates; the parent uses
 * onContent to refresh the live preview. Supports attaching a reference
 * screenshot (file picker or paste) so the model can match an existing design.
 */
export function DesignerChat({
  subAccountId,
  brandName,
  initialTranscript,
  initialStep,
  totalSteps,
  onContent,
  experience = "guided",
}: {
  subAccountId: string;
  brandName: string;
  initialTranscript: DesignerTurn[];
  initialStep: number;
  totalSteps: number;
  onContent: (content: AgentSiteContent) => void;
  experience?: "guided" | "vibe";
}) {
  const [turns, setTurns] = useState<ChatTurn[]>(initialTranscript);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(initialStep);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scrollDown = () =>
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      })
    );

  // Kick off the interview automatically if it hasn't started.
  useEffect(() => {
    if (turns.length === 0 && !loading)
      void send(
        experience === "vibe"
          ? "Load my approved Business Blueprint into this draft. Confirm what is already known and do not ask me to repeat it."
          : "Hi! I'm ready to build my site."
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function attachFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Attach an image file (PNG, JPG, or WebP).");
      return;
    }
    if (file.size > 12_000_000) {
      setError("That image is too large — keep it under 12MB.");
      return;
    }
    setError(null);
    try {
      setAttachment(await compressImage(file));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read the image."
      );
    }
  }

  async function send(message: string, image?: string | null) {
    const msg = message.trim();
    const img = image ?? null;
    if ((!msg && !img) || loading) return;
    setError(null);
    setInput("");
    setAttachment(null);
    // Don't echo the auto-kickoff message.
    if (turns.length > 0)
      setTurns((p) => [
        ...p,
        {
          role: "agent",
          content: msg || "Match this design.",
          ...(img ? { image: img } : {}),
        },
      ]);
    setLoading(true);
    scrollDown();

    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/agent-site/designer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: msg,
            brandName,
            mode: experience,
            ...(img ? { image: img } : {}),
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        content?: AgentSiteContent;
        step?: number;
        done?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setTurns((p) => [...p, { role: "designer", content: data.reply ?? "" }]);
      if (data.content) onContent(data.content);
      if (typeof data.step === "number") setStep(data.step);
      if (data.done) setDone(true);
      scrollDown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const pct = Math.round((Math.min(step, totalSteps) / totalSteps) * 100);

  return (
    <div className="bg-card flex h-full flex-col rounded-2xl border">
      {/* Header + progress */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {experience === "vibe" ? "Zack · Vibe Builder" : "Designer"}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {experience === "vibe"
                ? "Prompt changes or attach a screenshot to match"
                : done
                  ? "Your site is ready to preview & publish"
                  : `Step ${Math.min(step + 1, totalSteps)} of ${totalSteps}`}
            </p>
          </div>
        </div>
        <div
          className={`bg-muted mt-2 h-1 w-full overflow-hidden rounded-full ${experience === "vibe" ? "hidden" : ""}`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${done ? 100 : pct}%` }}
          />
        </div>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {turns.map((t, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              t.role === "agent" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                t.role === "agent"
                  ? "bg-[#1a2f50] text-white"
                  : "bg-background text-foreground border"
              )}
            >
              {t.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.image}
                  alt="Attached screenshot"
                  className="mb-2 max-h-40 w-full rounded-lg border border-white/20 object-cover"
                />
              ) : null}
              {t.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-background text-muted-foreground flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Designing…
            </div>
          </div>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>

      {/* Pending attachment */}
      {attachment ? (
        <div className="flex items-center gap-2 border-t px-3 pt-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment}
            alt="Screenshot ready to send"
            className="h-12 w-16 rounded-md border object-cover"
          />
          <p className="text-muted-foreground flex-1 text-xs">
            Screenshot attached — Zack will match this design.
          </p>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            className="text-muted-foreground hover:text-foreground rounded p-1"
            aria-label="Remove screenshot"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input, attachment);
        }}
        onPaste={(e) => {
          const item = Array.from(e.clipboardData?.items ?? []).find((it) =>
            it.type.startsWith("image/")
          );
          if (item) {
            e.preventDefault();
            void attachFile(item.getAsFile());
          }
        }}
        className="flex items-center gap-2 border-t px-3 py-2.5"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            void attachFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          title="Attach a screenshot of a website to match"
          aria-label="Attach a screenshot"
        >
          <ImagePlus className="h-3.5 w-3.5" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            experience === "vibe"
              ? attachment
                ? "Optional: what should match? (colors, hero, tone…)"
                : "Describe a change, or attach/paste a screenshot to copy…"
              : done
                ? "Ask the Designer to tweak anything…"
                : "Type your answer…"
          }
          maxLength={1500}
          disabled={loading}
          className="h-9"
        />
        <Button
          type="submit"
          size="sm"
          disabled={loading || (!input.trim() && !attachment)}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}

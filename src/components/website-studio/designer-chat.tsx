"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  ImagePlus,
  X,
  Code2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  countCssRules,
  extractExternalCode,
} from "@/lib/website-studio/external-prompt";
import type {
  AgentSiteContent,
  AgentSiteDesign,
  DesignerTurn,
} from "@/types/agent-site";

/** Matches the server's cap for Vibe mode; the guided interview stays short. */
const MAX_VIBE_MESSAGE_CHARS = 24_000;

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
  onDesign,
  experience = "guided",
}: {
  subAccountId: string;
  brandName: string;
  initialTranscript: DesignerTurn[];
  initialStep: number;
  totalSteps: number;
  onContent: (content: AgentSiteContent) => void;
  /** Vibe mode only — colors/fonts/radius/hero-layout/custom CSS updates. */
  onDesign?: (design: AgentSiteDesign) => void;
  experience?: "guided" | "vibe";
}) {
  const [turns, setTurns] = useState<ChatTurn[]>(initialTranscript);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(initialStep);
  const [done, setDone] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [clearing, setClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  /**
   * What a paste from Claude or ChatGPT will actually do, worked out before
   * the user commits to sending it. Gated on the cheap character check so a
   * 20KB paste isn't re-parsed on every keystroke of ordinary typing.
   */
  const pastedCode = useMemo(() => {
    if (experience !== "vibe") return null;
    if (!input.includes("{") && !input.includes("```")) return null;
    const extracted = extractExternalCode(input);
    return extracted.hasCode ? extracted : null;
  }, [input, experience]);

  // Grow the composer with a pasted block instead of hiding it in one line.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const scrollDown = () =>
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      })
    );

  const hasLegacyTranscript = useMemo(
    () =>
      experience === "vibe" &&
      turns.some(
        (turn) =>
          turn.role === "designer" &&
          (/controlled by (?:your|the) template/i.test(turn.content) ||
            /^what would you like to customize first\??$/i.test(
              turn.content.trim()
            ))
      ),
    [experience, turns]
  );

  async function clearConversation() {
    if (clearing || loading) return;
    setClearing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/agent-site`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ designerTranscript: [], designerStep: 0 }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not reset the conversation.");
      setTurns([]);
      setStep(0);
      setSuggestions([]);
      setDone(false);
      toast.success("Zack conversation reset. Your website draft was kept.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reset the conversation."
      );
    } finally {
      setClearing(false);
    }
  }

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
    if (experience === "vibe" && msg.length > MAX_VIBE_MESSAGE_CHARS) {
      setError(
        `That's ${msg.length.toLocaleString()} characters — the limit is ${MAX_VIBE_MESSAGE_CHARS.toLocaleString()}. Send the sections you want changed rather than the whole file.`
      );
      return;
    }
    setError(null);
    setInput("");
    setAttachment(null);
    setSuggestions([]);
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
        design?: AgentSiteDesign;
        suggestions?: string[];
        step?: number;
        done?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setTurns((p) => [...p, { role: "designer", content: data.reply ?? "" }]);
      if (data.content) onContent(data.content);
      if (data.design) onDesign?.(data.design);
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      if (typeof data.step === "number") setStep(data.step);
      if (data.done) setDone(true);
      scrollDown();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      // Nothing was saved, so put the message back. Retyping a pasted
      // stylesheet because a request failed is not an acceptable outcome.
      setInput((current) => current || msg);
      setTurns((p) =>
        p.length > 0 && p[p.length - 1].role === "agent" ? p.slice(0, -1) : p
      );
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
          {experience === "vibe" && turns.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void clearConversation()}
              disabled={loading || clearing}
              className="h-7 px-2 text-[11px]"
              title="Clear Zack's conversation while keeping the website draft"
            >
              {clearing ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3 w-3" />
              )}
              Start fresh
            </Button>
          ) : null}
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
      {hasLegacyTranscript ? (
        <div className="mx-3 mt-3 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>
            This conversation contains replies from the previous builder. Zack
            can now change colors, fonts, spacing, layout variants, and custom
            CSS directly.
          </span>
          <button
            type="button"
            onClick={() => void clearConversation()}
            disabled={loading || clearing}
            className="shrink-0 font-semibold underline underline-offset-2"
          >
            Reset chat
          </button>
        </div>
      ) : null}
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

      {/* Suggested next steps — grounded in what Zack can actually do
          (content fields, design tokens, customCss), never generic filler. */}
      {suggestions.length > 0 && !loading ? (
        <div className="flex flex-wrap gap-1.5 border-t px-3 pt-2.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => void send(s)}
              className="rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-800 transition-colors hover:bg-fuchsia-100"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      {/* What a pasted block from Claude/ChatGPT will do, before it is sent.
          Silent application would be worse than no support at all — the user
          has to know CSS lands verbatim and markup does not land at all. */}
      {pastedCode ? (
        <div
          className={cn(
            "mx-3 mt-2.5 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
            pastedCode.rejectedCss.length > 0 || pastedCode.tooLarge
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-indigo-200 bg-indigo-50 text-indigo-900"
          )}
        >
          {pastedCode.rejectedCss.length > 0 || pastedCode.tooLarge ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <Code2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span className="leading-5">
            {pastedCode.tooLarge
              ? `That stylesheet is over the ${MAX_VIBE_MESSAGE_CHARS.toLocaleString()}-character limit — send the sections you care about instead.`
              : pastedCode.rejectedCss.length > 0
                ? `This CSS uses ${pastedCode.rejectedCss.join(", ")}, which can’t run on a hosted site. Remove it and Zack will apply the rest.`
                : [
                    pastedCode.css
                      ? `${countCssRules(pastedCode.css)} CSS rules will be applied verbatim`
                      : null,
                    Object.keys(pastedCode.designTokens).length > 0
                      ? `design tokens: ${Object.keys(pastedCode.designTokens).join(", ")}`
                      : null,
                    pastedCode.unsupported.length > 0
                      ? `${[
                          ...new Set(
                            pastedCode.unsupported.map((b) => b.language)
                          ),
                        ].join(
                          ", "
                        )} can’t run here — Zack will translate the intent into styling instead`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
          </span>
        </div>
      ) : null}

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
        className="flex items-end gap-2 border-t px-3 py-2.5"
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
        {/* A textarea, not an input: pasted CSS and design specs from Claude
            or ChatGPT run to thousands of characters across many lines, and a
            single-line field truncated them at the maxLength without saying
            so. Enter still sends; Shift+Enter adds a line. */}
        <textarea
          ref={composerRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input, attachment);
            }
          }}
          placeholder={
            experience === "vibe"
              ? attachment
                ? "Optional: what should match? (colors, hero, tone…)"
                : "Describe a change, paste CSS or a design spec from Claude/ChatGPT, or paste a screenshot…"
              : done
                ? "Ask the Designer to tweak anything…"
                : "Type your answer…"
          }
          // No maxLength in Vibe mode: the browser truncates an over-long
          // paste without telling anyone, which is the exact failure this
          // work exists to remove. `send` reports the limit instead.
          maxLength={experience === "vibe" ? undefined : 1500}
          disabled={loading}
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 max-h-[180px] min-h-9 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50"
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

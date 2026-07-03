"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AgentSiteContent, DesignerTurn } from "@/types/agent-site";

/**
 * The AI Designer interview panel. Sends each answer to the designer API,
 * which returns the next question + applies content updates; the parent uses
 * onContent to refresh the live preview.
 */
export function DesignerChat({
  subAccountId,
  brandName,
  initialTranscript,
  initialStep,
  totalSteps,
  onContent,
}: {
  subAccountId: string;
  brandName: string;
  initialTranscript: DesignerTurn[];
  initialStep: number;
  totalSteps: number;
  onContent: (content: AgentSiteContent) => void;
}) {
  const [turns, setTurns] = useState<DesignerTurn[]>(initialTranscript);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(initialStep);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollDown = () =>
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
    );

  // Kick off the interview automatically if it hasn't started.
  useEffect(() => {
    if (turns.length === 0 && !loading) void send("Hi! I'm ready to build my site.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(message: string) {
    const msg = message.trim();
    if (!msg || loading) return;
    setError(null);
    setInput("");
    // Don't echo the auto-kickoff message.
    if (turns.length > 0) setTurns((p) => [...p, { role: "agent", content: msg }]);
    setLoading(true);
    scrollDown();

    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/agent-site/designer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, brandName }),
      });
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
    <div className="flex h-full flex-col rounded-2xl border bg-card">
      {/* Header + progress */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Designer</p>
            <p className="text-[11px] text-muted-foreground">
              {done ? "Your site is ready to preview & publish" : `Step ${Math.min(step + 1, totalSteps)} of ${totalSteps}`}
            </p>
          </div>
        </div>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${done ? 100 : pct}%` }}
          />
        </div>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "agent" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                t.role === "agent"
                  ? "bg-[#1a2f50] text-white"
                  : "border bg-background text-foreground",
              )}
            >
              {t.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Designing…
            </div>
          </div>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t px-3 py-2.5"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={done ? "Ask the Designer to tweak anything…" : "Type your answer…"}
          maxLength={1500}
          disabled={loading}
          className="h-9"
        />
        <Button type="submit" size="sm" disabled={loading || !input.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}

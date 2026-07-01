"use client";

import { useRef, useState } from "react";
import { Sparkles, Send, Loader2, MessageCircleQuestion } from "lucide-react";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED = [
  "How do I connect my phone number?",
  "How do I import my contacts?",
  "How do I turn on Speed-to-Lead?",
  "How do I activate my AI agent?",
];

export function OnboardingHelp() {
  const agency = useAgency();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;

    setError(null);
    setInput("");
    const history = turns.slice(-8);
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          history,
          brandName: agency.name === "LeadStack" ? undefined : agency.name,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: data.answer ?? "" },
      ]);
      // Scroll to the latest turn after paint.
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 px-4 py-3 text-left text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/20 dark:text-blue-300"
      >
        <MessageCircleQuestion className="h-4 w-4 shrink-0" />
        Stuck on a step? Ask the setup assistant
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/30 dark:border-blue-800/40 dark:bg-blue-950/10">
      <div className="flex items-center gap-2 border-b border-blue-200/60 px-4 py-2.5 dark:border-blue-800/40">
        <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="text-sm font-semibold">Setup assistant</span>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div ref={scrollRef} className="max-h-72 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Ask anything about setting up your CRM. Try:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-blue-300 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              t.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                t.role === "user"
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
              Thinking…
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2 border-t border-blue-200/60 px-3 py-2.5 dark:border-blue-800/40"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a setup question…"
          maxLength={1000}
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

"use client";

import { useRef, useState } from "react";
import { Sparkles, Send, Loader2, MessageSquareText, Search, Globe, Star } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const TOPICS = [
  { icon: MessageSquareText, label: "A2P SMS registration", q: "How do I register for A2P 10DLC so my texts get delivered?" },
  { icon: Globe, label: "Chat widget", q: "How do I add the chat widget to my website?" },
  { icon: Search, label: "SEO basics", q: "How do I get my website found on Google?" },
  { icon: Star, label: "Google Business Profile", q: "How do I set up my Google Business Profile?" },
];

export function BusinessSetupAssistant() {
  const { subAccountId } = useSubAccount();
  const agency = useAgency();
  const brandName = agency.name === "LeadStack" ? undefined : agency.name;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    const history = turns.slice(-8);
    setTurns((p) => [...p, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/business-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history, brandName }),
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setTurns((p) => [...p, { role: "assistant", content: data.answer ?? "" }]);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Business Setup assistant</h2>
        <p className="text-sm text-muted-foreground">
          Get step-by-step help with the essentials — A2P SMS registration, your
          chat widget, local SEO, and Google Business Profile.
        </p>
      </div>

      {/* Topic chips */}
      <div className="grid gap-2 sm:grid-cols-2">
        {TOPICS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.label}
              onClick={() => ask(t.q)}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl border bg-card p-3 text-left text-sm transition-colors hover:border-blue-300 disabled:opacity-60"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40">
                <Icon className="h-4 w-4" />
              </span>
              <span className="font-medium">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Chat */}
      <div className="mt-4 rounded-2xl border bg-card">
        <div ref={scrollRef} className="max-h-[46vh] min-h-[120px] space-y-3 overflow-y-auto p-4">
          {turns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Pick a topic above or ask your own question below.
            </p>
          )}
          {turns.map((t, i) => (
            <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                  t.role === "user" ? "bg-[#1a2f50] text-white" : "border bg-background text-foreground",
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
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="flex items-center gap-2 border-t px-3 py-2.5"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a setup question…"
            maxLength={1000}
            disabled={loading}
            className="h-9 border-0 shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="sm" disabled={loading || !input.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}

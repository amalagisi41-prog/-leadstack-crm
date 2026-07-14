"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { CUSTOM_BRAND } from "@/config/landing";
import { cn } from "@/lib/utils";

/**
 * "Ask AgentStack" — the operator's AI assistant, available on every
 * dashboard page as a right-hand slide-over. Opened from the header pill or
 * the sidebar entry via a window event so no prop-drilling is needed.
 *
 * On Studio surfaces (Website Studio, Social Planner, Funnels, Broadcasts,
 * Templates) the assistant switches to a marketing + design persona and
 * shows matching suggestion chips.
 */

const OPEN_EVENT = "agentstack:ask-assistant";

interface OpenAskAssistantOptions {
  /**
   * Pre-seeded question fired immediately on open — used by contextual
   * triggers elsewhere in the app (e.g. "Summarize this conversation" on a
   * Conversation thread, "Suggest next action" on a Contact profile) so the
   * operator gets an answer in one click instead of composing the prompt
   * themselves.
   */
  prompt?: string;
}

export function openAskAssistant(options?: OpenAskAssistantOptions) {
  window.dispatchEvent(
    new CustomEvent<OpenAskAssistantOptions>(OPEN_EVENT, {
      detail: options ?? {},
    }),
  );
}

const STUDIO_PATHS = ["/website-studio", "/social", "/funnels", "/broadcasts", "/templates", "/website"];

const CRM_SUGGESTIONS = [
  "Write a follow-up email for a buyer who went quiet",
  "What should I focus on today?",
  "Help me prepare for a listing appointment",
  "Draft a market update for my sphere",
];

const STUDIO_SUGGESTIONS = [
  "Write a listing description for a 3BR colonial",
  "Draft 5 Instagram captions for a new listing",
  "Write copy for a home-valuation landing page",
  "What should my open house email say?",
];

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function AskAssistantPanel() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const firstName = (user?.displayName ?? "").split(" ")[0] || "";
  const subAccountId = pathname?.match(/^\/sa\/([^/]+)/)?.[1] ?? null;
  const isStudio = STUDIO_PATHS.some((p) => pathname?.includes(p));
  const suggestions = isStudio ? STUDIO_SUGGESTIONS : CRM_SUGGESTIONS;

  useEffect(() => {
    function onOpen(e: Event) {
      const prompt = (e as CustomEvent<OpenAskAssistantOptions>).detail?.prompt;
      setOpen(true);
      if (prompt && prompt.trim()) {
        askRef.current(prompt);
      } else {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking]);

  // Always-current ref so the open-event listener (attached once on mount)
  // can fire the latest `ask` without a stale closure over `messages`.
  const askRef = useRef<(q: string) => void>(() => {});

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || thinking) return;
      setInput("");
      setMessages((m) => [...m, { role: "user", content: q }]);
      setThinking(true);
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: q,
            history: messages.slice(-10),
            subAccountId,
            mode: isStudio ? "studio" : "crm",
            firstName,
          }),
        });
        const data = (await res.json()) as { answer?: string; error?: string };
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: res.ok && data.answer ? data.answer : (data.error ?? "Something went wrong — try again."),
          },
        ]);
      } catch {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "I couldn't reach the server. Check your connection and try again." },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [messages, thinking, subAccountId, isStudio, firstName],
  );

  useEffect(() => {
    askRef.current = (q: string) => void ask(q);
  }, [ask]);

  if (!open) return null;

  return (
    <>
      <button
        aria-label="Close assistant"
        onClick={() => setOpen(false)}
        className="fixed inset-0 z-40 bg-black/20 md:bg-transparent"
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[400px] flex-col border-l bg-card shadow-2xl"
        role="dialog"
        aria-label={`Ask ${CUSTOM_BRAND.name}`}
      >
        {/* header */}
        <div className="flex shrink-0 items-center justify-between gap-3 bg-primary px-4 py-3.5 text-primary-foreground">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600">
              <Bot className="h-5 w-5 text-white" />
            </span>
            <div>
              <p className="font-semibold leading-tight">{CUSTOM_BRAND.name} AI</p>
              <p className="text-xs text-primary-foreground/60">Ask me anything</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-md p-1.5 text-primary-foreground/70 transition-colors hover:bg-white/10 hover:text-primary-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* thread */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          <AssistantBubble>
            Hi{firstName ? ` ${firstName}` : ""}! I&apos;m your {CUSTOM_BRAND.name} AI.
            {isStudio
              ? " I'm also your marketing and design assistant here in the Studio — ask me for listing copy, captions, campaign ideas, or design advice."
              : " I know your business and your goals. Ask me anything — I can write emails, prep you for appointments, or tell you what to do next."}
          </AssistantBubble>

          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <AssistantBubble key={i}>{m.content}</AssistantBubble>
            ) : (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-foreground px-3.5 py-2.5 text-sm text-background">
                  {m.content}
                </div>
              </div>
            ),
          )}

          {thinking && (
            <AssistantBubble>
              <span className="inline-flex gap-1">
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
              </span>
            </AssistantBubble>
          )}

          {messages.length === 0 && !thinking && (
            <div className="flex flex-col gap-2 pt-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => void ask(s)}
                  className="flex items-center gap-2 rounded-full border bg-background px-3.5 py-2 text-left text-xs transition-colors hover:bg-muted"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* composer */}
        <form
          className="flex shrink-0 items-end gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            placeholder={`Ask ${CUSTOM_BRAND.name} AI…`}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(input);
              }
            }}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-full border bg-muted/60 px-4 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/30"
          />
          <button
            type="submit"
            disabled={!input.trim() || thinking}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </aside>
    </>
  );
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-600">
        <Sparkles className="h-3.5 w-3.5 text-white" />
      </span>
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border bg-background px-3.5 py-2.5 text-sm leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  );
}

/** Header pill that opens the assistant. */
export function AskAssistantButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => openAskAssistant()}
      className={cn(
        "flex items-center gap-1.5 rounded-full border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted",
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5 text-rose-500" />
      <span className="hidden sm:inline">Ask {CUSTOM_BRAND.name}</span>
    </button>
  );
}

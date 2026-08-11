"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Check, Loader2, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { ZackAction } from "@/lib/assistant/actions";

/**
 * "Ask Zack" — the operator's AI assistant, available on every
 * dashboard page as a right-hand slide-over. Opened from the header pill or
 * the sidebar entry via a window event so no prop-drilling is needed.
 *
 * On Studio surfaces (Website Studio, Social Planner, Funnels, Broadcasts,
 * Templates) the assistant switches to a marketing + design persona and
 * shows matching suggestion chips.
 */

const OPEN_EVENT = "agentstack:ask-assistant";
const ASSISTANT_NAME = "Zack";

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
  action?: ZackAction | null;
}

export function AskAssistantPanel() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [actionState, setActionState] = useState<
    Record<number, "running" | "done" | "error">
  >({});
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
            currentPath: `${pathname}${window.location.search}`,
          }),
        });
        const data = (await res.json()) as {
          answer?: string;
          error?: string;
          action?: ZackAction | null;
        };
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: res.ok && data.answer ? data.answer : (data.error ?? "Something went wrong — try again."),
            action: res.ok ? data.action : null,
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
    [messages, thinking, subAccountId, isStudio, firstName, pathname],
  );

  useEffect(() => {
    askRef.current = (q: string) => void ask(q);
  }, [ask]);

  async function approveAction(action: ZackAction, messageIndex: number) {
    if (!subAccountId && action.type !== "navigate") {
      setActionState((state) => ({ ...state, [messageIndex]: "error" }));
      return;
    }
    setActionState((state) => ({ ...state, [messageIndex]: "running" }));
    try {
      if (action.type === "navigate") {
        router.push(action.path);
        setOpen(false);
      } else {
        let endpoint = "";
        let method = "POST";
        let body: Record<string, unknown> = {};
        if (action.type === "set_daily_briefing") {
          endpoint = `/api/sub-accounts/${subAccountId}/daily-briefing`;
          body = { enabled: action.enabled };
        } else if (action.type === "set_ai_channel") {
          endpoint = `/api/sub-accounts/${subAccountId}/ai-agent/channels/${action.channel}`;
          method = "PATCH";
          body = { enabled: action.enabled };
        } else {
          endpoint = `/api/agency/sub-accounts/${subAccountId}/feature-gates`;
          method = "PATCH";
          body = { [action.feature]: action.enabled };
        }
        const response = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "The change could not be applied.");
      }
      setActionState((state) => ({ ...state, [messageIndex]: "done" }));
      setMessages((items) => [
        ...items,
        { role: "assistant", content: `${action.label} is complete.` },
      ]);
    } catch (error) {
      setActionState((state) => ({ ...state, [messageIndex]: "error" }));
      setMessages((items) => [
        ...items,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? `I couldn't make that change: ${error.message}`
              : "I couldn't make that change. Please try again.",
        },
      ]);
    }
  }

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
        aria-label={`Ask ${ASSISTANT_NAME}`}
      >
        {/* header */}
        <div className="flex shrink-0 items-center justify-between gap-3 bg-primary px-4 py-3.5 text-primary-foreground">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600">
              <Bot className="h-5 w-5 text-white" />
            </span>
            <div>
              <p className="font-semibold leading-tight">{ASSISTANT_NAME}</p>
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
            Hi{firstName ? ` ${firstName}` : ""}! I&apos;m Zack, your AgentStack assistant.
            {isStudio
              ? " I'm also your marketing and design assistant here in the Studio — ask me for listing copy, captions, campaign ideas, or design advice."
              : " I know your business and your goals. Ask me anything — I can write emails, prep you for appointments, or tell you what to do next."}
          </AssistantBubble>

          {messages.map((m, i) =>
            m.role === "assistant" ? (
              <div key={i} className="space-y-2">
                <AssistantBubble>{m.content}</AssistantBubble>
                {m.action ? (
                  <PermissionCard
                    action={m.action}
                    state={actionState[i]}
                    onApprove={() => void approveAction(m.action!, i)}
                    onDecline={() =>
                      setMessages((items) =>
                        items.map((item, index) =>
                          index === i ? { ...item, action: null } : item,
                        ),
                      )
                    }
                  />
                ) : null}
              </div>
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
            placeholder={`Ask ${ASSISTANT_NAME}…`}
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

function PermissionCard({
  action,
  state,
  onApprove,
  onDecline,
}: {
  action: ZackAction;
  state?: "running" | "done" | "error";
  onApprove: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="ml-9 rounded-xl border border-blue-200 bg-blue-50 p-3 text-[#173B7A] dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">Your permission is required</p>
          <p className="mt-1 text-xs leading-5">{action.description}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={state === "running" || state === "done"}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[#173B7A] px-3 text-xs font-semibold text-white disabled:opacity-60"
        >
          {state === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : state === "done" ? (
            <Check className="h-3.5 w-3.5" />
          ) : null}
          {state === "done" ? "Completed" : action.label}
        </button>
        {state !== "done" ? (
          <button
            type="button"
            onClick={onDecline}
            disabled={state === "running"}
            className="min-h-9 rounded-lg border bg-white px-3 text-xs font-medium text-slate-700 disabled:opacity-60 dark:bg-slate-900 dark:text-slate-200"
          >
            Not now
          </button>
        ) : null}
      </div>
      {state === "error" ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">
          The change was not applied. Zack added the reason below.
        </p>
      ) : null}
    </div>
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
      <span className="hidden sm:inline">Ask {ASSISTANT_NAME}</span>
    </button>
  );
}

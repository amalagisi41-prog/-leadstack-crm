"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  MessageSquareText,
  Search,
  Globe,
  Star,
  CheckCircle2,
  LockKeyhole,
  Server,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  DomainStartingPoint,
  HostingStartingPoint,
  OnboardingFoundation,
} from "@/types/onboarding-foundation";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const TOPICS = [
  {
    icon: MessageSquareText,
    label: "A2P SMS registration",
    q: "How do I register for A2P 10DLC so my texts get delivered?",
  },
  {
    icon: Globe,
    label: "Chat widget",
    q: "How do I add the chat widget to my website?",
  },
  {
    icon: Search,
    label: "SEO basics",
    q: "How do I get my website found on Google?",
  },
  {
    icon: Star,
    label: "Google Business Profile",
    q: "How do I set up my Google Business Profile?",
  },
];

const HOSTS = [
  {
    name: "AgentStack Managed",
    initials: "AS",
    detail: "Simplest setup for non-technical users",
    value: "agentstack_managed" as const,
    href: "",
    color: "bg-[#1f4f91]",
  },
] as const;

export function BusinessSetupAssistant({
  onFoundationChange,
  foundationComplete = false,
}: {
  onFoundationChange?: (ready: boolean) => void;
  foundationComplete?: boolean;
}) {
  const { subAccountId, saPath } = useSubAccount();
  const agency = useAgency();
  const brandName = agency.name === "AgentStack" ? undefined : agency.name;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foundation, setFoundation] = useState<OnboardingFoundation | null>(
    null
  );
  const [domainPoint, setDomainPoint] =
    useState<DomainStartingPoint>("not_sure");
  const [hostingPoint, setHostingPoint] = useState<HostingStartingPoint | null>(
    null
  );
  const [domainName, setDomainName] = useState("");
  const [domainConfirmed, setDomainConfirmed] = useState(false);
  const [hostingConfirmed, setHostingConfirmed] = useState(false);
  const [savingFoundation, setSavingFoundation] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/sub-accounts/${subAccountId}/onboarding-foundation`)
      .then((response) => response.json())
      .then((data: { foundation?: OnboardingFoundation }) => {
        if (!active || !data.foundation) return;
        setFoundation(data.foundation);
        setDomainPoint(data.foundation.domainStartingPoint ?? "not_sure");
        setHostingPoint(data.foundation.hostingStartingPoint);
        setDomainName(data.foundation.domainName ?? "");
        setDomainConfirmed(data.foundation.domainSetupConfirmed === true);
        setHostingConfirmed(data.foundation.hostingSetupConfirmed === true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [subAccountId]);

  async function saveFoundation(
    nextDomain = domainPoint,
    nextHosting = hostingPoint
  ) {
    if (
      nextDomain === "not_sure" ||
      !nextHosting ||
      !domainConfirmed ||
      !hostingConfirmed ||
      !domainName.trim()
    ) {
      toast.error("Complete and confirm the domain and hosting steps first.");
      return;
    }
    setSavingFoundation(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/onboarding-foundation`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode:
              foundation?.mode ??
              (nextDomain === "have_domain" ? "transfer" : "foundation"),
            sourcePlatform: foundation?.sourcePlatform ?? null,
            sourceUrl: foundation?.sourceUrl ?? "",
            domainStartingPoint: nextDomain,
            hostingStartingPoint: nextHosting,
            domainName,
            domainSetupConfirmed: domainConfirmed,
            hostingSetupConfirmed: hostingConfirmed,
            profileImported: foundation?.profileImported === true,
          }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        foundation?: OnboardingFoundation;
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not save the foundation.");
      if (data.foundation) setFoundation(data.foundation);
      onFoundationChange?.(true);
      toast.success("Foundation saved. Website Builder is now available.");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not save the foundation."
      );
    } finally {
      setSavingFoundation(false);
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    const history = turns.slice(-8);
    setTurns((p) => [...p, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/business-setup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, history, brandName }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setTurns((p) => [
        ...p,
        { role: "assistant", content: data.answer ?? "" },
      ]);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {foundationComplete ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold">Website foundation is complete</p>
              <p className="mt-1 text-sm text-emerald-900/75">
                Your domain and managed-hosting path are already saved. There is
                nothing to repeat here; return to Vibe Builder to keep editing
                the private site.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-card overflow-hidden rounded-2xl border">
          <div className="bg-gradient-to-r from-[#173b7a] to-[#315f9d] p-6 text-white">
            <p className="text-xs font-semibold tracking-[0.18em] text-pink-200 uppercase">
              Website foundation · required first
            </p>
            <h2 className="mt-2 text-xl font-bold">
              Choose your domain and hosting before building.
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-blue-100">
              Request a new domain or connect one you own, then use
              AgentStack-managed hosting. Setup and private credentials remain
              inside AgentStack.
            </p>
          </div>

          <div className="bg-muted/20 border-b px-5 py-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ["1", "Domain", domainConfirmed],
                ["2", "Hosting", hostingConfirmed],
                ["3", "Build website", domainConfirmed && hostingConfirmed],
              ].map(([number, label, done]) => (
                <div
                  key={String(number)}
                  className={cn(
                    "bg-background flex items-center gap-3 rounded-xl border p-3 text-sm",
                    done && "border-emerald-200 bg-emerald-50 text-emerald-800"
                  )}
                >
                  <span
                    className={cn(
                      "bg-muted flex h-7 w-7 items-center justify-center rounded-full font-semibold",
                      done && "bg-emerald-600 text-white"
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : number}
                  </span>
                  <span className="font-semibold">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6 p-5">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold">1. Domain</h3>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDomainPoint("have_domain")}
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm",
                    domainPoint === "have_domain" &&
                      "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15"
                  )}
                >
                  <span className="font-semibold">I own a domain</span>
                  <span className="text-muted-foreground mt-1 block text-xs">
                    Connect it without moving it yet
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDomainPoint("need_domain")}
                  className={cn(
                    "rounded-xl border p-3 text-left text-sm",
                    domainPoint === "need_domain" &&
                      "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15"
                  )}
                >
                  <span className="font-semibold">I need a domain</span>
                  <span className="text-muted-foreground mt-1 block text-xs">
                    Request registration inside AgentStack
                  </span>
                </button>
              </div>
              {domainPoint === "need_domain" ? (
                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-blue-950">
                    AgentStack-managed domain registration
                  </p>
                  <p className="mt-1 text-xs text-blue-900/75">
                    Enter the domain you want below. AgentStack saves the
                    request and keeps registration, DNS, SSL, and hosting in one
                    guided workflow—no provider dashboard or password is
                    required here.
                  </p>
                </div>
              ) : null}
              {domainPoint === "have_domain" ? (
                <div className="mt-3 rounded-xl border bg-blue-50 p-4">
                  <p className="text-sm font-semibold text-[#173b7a]">
                    Connect the domain you already own
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Open Domain Setup for the exact DNS records. Your current
                    website stays live while you connect it.
                  </p>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    render={<a href={saPath("/domain")} />}
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Open AgentStack domain setup
                  </Button>
                </div>
              ) : null}
              {domainPoint !== "not_sure" ? (
                <div className="mt-3 space-y-3 rounded-xl border p-4">
                  <label className="block text-sm font-medium">
                    What is the domain name?
                  </label>
                  <Input
                    value={domainName}
                    onChange={(event) => {
                      setDomainName(event.target.value);
                      setDomainConfirmed(false);
                    }}
                    placeholder="yourbusiness.com"
                  />
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={domainConfirmed}
                      onChange={(event) =>
                        setDomainConfirmed(event.target.checked)
                      }
                      disabled={!domainName.trim()}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      <strong className="block">
                        I finished this domain step
                      </strong>
                      <span className="text-muted-foreground text-xs">
                        I registered the domain or opened its connection
                        instructions.
                      </span>
                    </span>
                  </label>
                </div>
              ) : null}
            </div>

            <div
              className={cn(
                !domainConfirmed && "pointer-events-none opacity-45"
              )}
            >
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold">2. Hosting</h3>
              </div>
              <div className="mt-3 grid gap-2">
                {HOSTS.map((provider) => {
                  const card = (
                    <>
                      <span
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold text-white",
                          provider.color
                        )}
                      >
                        {provider.initials}
                      </span>
                      <span className="mt-2 flex items-center gap-1 text-sm font-semibold">
                        {provider.name}
                      </span>
                      <span className="text-muted-foreground mt-1 block text-[11px] leading-4">
                        {provider.detail}
                      </span>
                      {hostingPoint === provider.value ? (
                        <CheckCircle2 className="absolute top-2 right-2 h-4 w-4 text-blue-600" />
                      ) : null}
                    </>
                  );
                  const className = cn(
                    "relative rounded-xl border bg-background p-3 text-left transition hover:border-blue-400",
                    hostingPoint === provider.value &&
                      "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15"
                  );
                  return (
                    <button
                      key={provider.name}
                      type="button"
                      className={className}
                      onClick={() => setHostingPoint(provider.value)}
                    >
                      {card}
                    </button>
                  );
                })}
              </div>
              <p className="bg-muted/50 text-muted-foreground mt-3 flex items-start gap-2 rounded-lg p-3 text-xs">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                Secret keys are stored server-side and are never displayed in
                the website editor. Any domain or hosting charge must be
                confirmed inside AgentStack before it is submitted.
              </p>
              {hostingPoint ? (
                <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm">
                  <input
                    type="checkbox"
                    checked={hostingConfirmed}
                    onChange={(event) =>
                      setHostingConfirmed(event.target.checked)
                    }
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    <strong className="block">
                      I finished this hosting step
                    </strong>
                    <span className="text-muted-foreground text-xs">
                      I selected managed hosting or completed the provider
                      sign-in.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          </div>

          <div className="bg-muted/20 flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <strong>
                Website Builder unlocks after both steps are confirmed.
              </strong>
              <span className="text-muted-foreground ml-1">
                You can change providers later.
              </span>
            </p>
            <Button
              onClick={() => void saveFoundation()}
              disabled={
                savingFoundation ||
                domainPoint === "not_sure" ||
                !hostingPoint ||
                !domainConfirmed ||
                !hostingConfirmed ||
                !domainName.trim()
              }
            >
              {savingFoundation ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Save foundation &amp; unlock builder
            </Button>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50">
        <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-violet-700 uppercase">
              Optional migration &amp; hosting provider
            </p>
            <h2 className="mt-2 text-lg font-semibold text-violet-950">
              Hostinger website migration and new-site hosting
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-violet-900/75">
              Use Hostinger when you prefer its managed hosting. Hostinger
              advertises website migration with eligible hosting plans, while
              your current site remains available during the migration.
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              Optional external service. Plan availability, migration
              eligibility, pricing, support, and checkout are provided by
              Hostinger—not AgentStack.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Button
              variant="outline"
              render={
                <a
                  href="https://www.hostinger.com/website-migration"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setHostingPoint("transfer_existing")}
                />
              }
            >
              Migrate an existing site
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              render={
                <a
                  href="https://www.hostinger.com/web-hosting"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setHostingPoint("transfer_existing")}
                />
              }
            >
              Host a new website
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Business Setup assistant
          </h2>
          <p className="text-muted-foreground text-sm">
            Get step-by-step help with the essentials — A2P SMS registration,
            your chat widget, local SEO, and Google Business Profile.
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
                className="bg-card flex items-center gap-2 rounded-xl border p-3 text-left text-sm transition-colors hover:border-blue-300 disabled:opacity-60"
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
        <div className="bg-card mt-4 rounded-2xl border">
          <div
            ref={scrollRef}
            className="max-h-[46vh] min-h-[120px] space-y-3 overflow-y-auto p-4"
          >
            {turns.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Pick a topic above or ask your own question below.
              </p>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  t.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                    t.role === "user"
                      ? "bg-[#1a2f50] text-white"
                      : "bg-background text-foreground border"
                  )}
                >
                  {t.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-background text-muted-foreground flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm">
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
    </div>
  );
}

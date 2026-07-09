"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  Calendar,
  Check,
  Clock,
  Crown,
  Globe,
  Home,
  Key,
  Mail,
  MapPin,
  Phone,
  Rocket,
  Search,
  Share2,
  Star,
  Target,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/brand/logo-mark";
import { CUSTOM_BRAND } from "@/config/landing";
import { ONBOARDING_STEP_IDS } from "@/lib/onboarding/steps";
import { useAuth } from "@/hooks/use-auth";
import type { FunnelGoalId } from "@/types/funnel";

/* ---------- types ---------- */

interface WizardProps {
  subAccountId: string;
  saPath: (p: string) => string;
  initialCompleted: string[];
}

type StepOutcome = "complete" | "skipped";

/* ---------- step metadata (sidebar) ---------- */

const SETUP_STEPS = [
  { label: "Business Brain", minutes: 3 },
  { label: "Import Contacts", minutes: 2 },
  { label: "Connect Your Business", minutes: 3 },
  { label: "Choose Your Goals", minutes: 2 },
  { label: "Launch Marketing", minutes: 2 },
  { label: "Go Live", minutes: 1 },
] as const;

/* ---------- step 1 — business profile fields ---------- */

interface ProfileDraft {
  agentName: string;
  title: string;
  brokerage: string;
  licenseNumber: string;
  phone: string;
  email: string;
  website: string;
  serviceAreas: string;
}

const EMPTY_DRAFT: ProfileDraft = {
  agentName: "",
  title: "",
  brokerage: "",
  licenseNumber: "",
  phone: "",
  email: "",
  website: "",
  serviceAreas: "",
};

const PROFILE_FIELDS: {
  key: keyof ProfileDraft;
  label: string;
  placeholder: string;
  required?: boolean;
}[] = [
  { key: "agentName", label: "Full Name", placeholder: "Jane Smith", required: true },
  { key: "title", label: "Title", placeholder: "Realtor®" },
  { key: "brokerage", label: "Brokerage Name", placeholder: "Keller Williams" },
  { key: "licenseNumber", label: "License Number", placeholder: "AB123456789" },
  { key: "phone", label: "Phone", placeholder: "(555) 123-4567" },
  { key: "email", label: "Email", placeholder: "jane@brokerage.com" },
  { key: "website", label: "Website", placeholder: "janesmith.com" },
  {
    key: "serviceAreas",
    label: "Service Areas (comma separated)",
    placeholder: "Maplewood, South Orange, Montclair",
  },
];

/* ---------- step 3 — connections ---------- */

const CONNECTIONS = [
  { icon: Mail, title: "Email", desc: "Gmail, Outlook, or IMAP", href: "/dashboard/settings" },
  { icon: Phone, title: "Phone", desc: "Business phone for SMS & calls", href: "/dashboard/settings?tab=sms" },
  { icon: Calendar, title: "Calendar", desc: "Google Calendar or Outlook", href: "/calendar" },
  { icon: Building2, title: "Google Business Profile", desc: "Respond to reviews & messages", href: "/ai-agents/google-business" },
  { icon: Globe, title: "Website", desc: "Capture leads from your site", href: "/website" },
  { icon: Share2, title: "Social Accounts", desc: "Facebook, Instagram, LinkedIn", href: "/social" },
] as const;

/* ---------- step 4 — goals ---------- */

const GOALS = [
  { id: "close_more", icon: TrendingUp, title: "Close more deals", desc: "Maximize conversion at every stage" },
  { id: "save_time", icon: Clock, title: "Save time on follow-up", desc: "Let AI handle the repetitive work" },
  { id: "reviews", icon: Star, title: "Get more reviews", desc: "Automatically request reviews after closing" },
  { id: "farm", icon: MapPin, title: "Grow my farm area", desc: "Build presence in target neighborhoods" },
  { id: "team", icon: Users, title: "Manage a team", desc: "Coordinate agents and route leads" },
  { id: "capture", icon: Target, title: "Capture more leads", desc: "Launch proven lead generation systems" },
] as const;

/* ---------- step 5 — marketing systems ---------- */

const MARKETING_SYSTEMS = [
  { id: "home_valuation", icon: Home, title: "Home Valuation", conversion: "12–18%" },
  { id: "buyer_consult", icon: Search, title: "Buyer Consultation", conversion: "25–35%" },
  { id: "showing", icon: Key, title: "Schedule a Showing", conversion: "40–50%" },
  { id: "open_house", icon: BookOpen, title: "Open House Registration", conversion: "30–45%" },
  { id: "luxury", icon: Crown, title: "Luxury Buyer", conversion: "10–20%" },
  { id: "seller_guide", icon: BookOpen, title: "Seller Guide", conversion: "15–25%" },
] as const;

/* ---------- persist helper ---------- */

async function persistSteps(subAccountId: string, steps: string[]) {
  await fetch(`/api/sub-accounts/${subAccountId}/onboarding`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steps }),
  }).catch(() => {});
}

/* ════════════════════════════════════════════════════════════
   Main component
   ════════════════════════════════════════════════════════════ */

export function OnboardingWizard({
  subAccountId,
  saPath,
  initialCompleted,
}: WizardProps) {
  const router = useRouter();
  const { agencyRole } = useAuth();
  const isAgencyOwner = agencyRole === "owner";
  const [step, setStep] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<number, StepOutcome>>({});
  const [completed, setCompleted] = useState<Set<string>>(
    () => new Set(initialCompleted),
  );

  // Step 1 form state
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  // Step 4 + 5 selections
  const [goals, setGoals] = useState<Set<string>>(new Set());
  const [systems, setSystems] = useState<Set<string>>(new Set());
  const [launching, setLaunching] = useState(false);

  // Prefill the profile form from the saved Business Profile.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/sub-accounts/${subAccountId}/business-profile`);
        if (!res.ok) return;
        const data = (await res.json()) as { profile?: Partial<ProfileDraft> };
        if (!active || !data.profile) return;
        setDraft((d) => {
          const next = { ...d };
          for (const key of Object.keys(EMPTY_DRAFT) as (keyof ProfileDraft)[]) {
            const v = data.profile?.[key];
            if (typeof v === "string" && v) next[key] = v;
          }
          return next;
        });
      } catch {
        /* prefill is best-effort */
      }
    })();
    return () => {
      active = false;
    };
  }, [subAccountId]);

  const markDone = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      setCompleted((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        void persistSteps(subAccountId, Array.from(next));
        return next;
      });
    },
    [subAccountId],
  );

  const advance = useCallback(
    (outcome: StepOutcome, stepIds: string[] = []) => {
      markDone(stepIds);
      setOutcomes((o) => ({ ...o, [step]: outcome }));
      setStep((s) => Math.min(s + 1, SETUP_STEPS.length - 1));
      window.scrollTo({ top: 0 });
    },
    [markDone, step],
  );

  const back = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0 });
  }, []);

  async function saveProfileAndContinue() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/business-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error("Couldn't save your profile.");
      advance("complete", ["business_profile"]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const goLive = useCallback(() => {
    markDone([...ONBOARDING_STEP_IDS]);
    router.replace(saPath("/dashboard"));
  }, [markDone, router, saPath]);

  async function launchMarketingAndContinue() {
    if (systems.size === 0) {
      advance("skipped");
      return;
    }
    setLaunching(true);
    try {
      // Funnels (Marketing Pages) are gated behind the Website Studio
      // add-on. The agency owner going through their own onboarding
      // wizard IS the person who'd flip that gate on anyway — auto-enable
      // it here so "launch in one click" actually holds. Non-owners can't
      // self-enable; their create calls below will 403 with a clear
      // message instead.
      if (isAgencyOwner) {
        await fetch(`/api/agency/sub-accounts/${subAccountId}/feature-gates`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ websiteStudioEnabled: true }),
        }).catch(() => undefined);
      }

      let created = 0;
      let lastError = "";
      for (const goalId of systems) {
        const res = await fetch(`/api/sub-accounts/${subAccountId}/funnels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: goalId as FunnelGoalId }),
        });
        if (res.ok) {
          created += 1;
        } else {
          const payload = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          lastError = payload.error ?? "Couldn't create a marketing page.";
        }
      }

      if (created > 0) {
        toast.success(
          `Launched ${created} marketing page${created > 1 ? "s" : ""} — find ${
            created > 1 ? "them" : "it"
          } under Marketing Pages.`,
        );
        advance("complete", ["form", "automation"]);
      } else {
        toast.error(lastError || "Couldn't launch marketing pages.");
      }
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      {/* ── header ── */}
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <LogoMark size={30} idSuffix="-wizard" />
            <span className="text-lg font-bold tracking-tight">{CUSTOM_BRAND.name}</span>
          </div>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Estimated completion: <span className="font-semibold text-foreground">15 minutes</span>
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* ── progress ── */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold">
              Step {step + 1} of {SETUP_STEPS.length}
            </span>
            <span className="font-medium text-muted-foreground">
              {SETUP_STEPS[step].label}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-rose-600 transition-all duration-300"
              style={{ width: `${((step + 1) / SETUP_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* ── main content ── */}
        <main className="pb-16">
          {step === 0 && (
            <StepFrame
              step={1}
              title="Build your AI Business Brain"
              subtitle="Tell AgentStack about your business one time. This becomes the single source of truth for every AI feature."
              why="Every AI response, follow-up, and automation references this profile. Change one item and the entire platform updates."
              minutes={3}
              requirement="Required"
            >
              <div className="space-y-5">
                {PROFILE_FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="mb-1.5 block text-sm font-semibold">
                      {f.label}
                      {f.required && <span className="text-rose-600"> *</span>}
                    </span>
                    <input
                      type="text"
                      value={draft[f.key]}
                      placeholder={f.placeholder}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      className="w-full rounded-lg border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/30"
                    />
                  </label>
                ))}
              </div>
              <FooterNav
                onContinue={saveProfileAndContinue}
                continueDisabled={!draft.agentName.trim() || saving}
                continueLabel={saving ? "Saving…" : "Continue"}
              />
            </StepFrame>
          )}

          {step === 1 && (
            <StepFrame
              step={2}
              title="Import your contacts"
              subtitle="Bring your database with you. Upload a CSV from your old CRM or add contacts manually — AgentStack handles mapping and duplicates."
              why="Your follow-up, pipeline, and AI responses all start from your contact list. Even a partial import gets the system working immediately."
              minutes={2}
              requirement="Can skip"
            >
              <div className="space-y-3">
                <ConnectRow
                  icon={Upload}
                  title="Upload a CSV"
                  desc="Export from GoHighLevel, Follow Up Boss, kvCORE, or any CRM"
                  href={saPath("/contacts?import=1")}
                  cta="Import"
                />
                <ConnectRow
                  icon={Users}
                  title="Add manually"
                  desc="Got a handful of leads? Add them one at a time"
                  href={saPath("/contacts")}
                  cta="Open People"
                />
              </div>
              <FooterNav
                onBack={back}
                onSkip={() => advance("skipped")}
                onContinue={() => advance("complete", ["contacts"])}
              />
            </StepFrame>
          )}

          {step === 2 && (
            <StepFrame
              step={3}
              title="Connect your business"
              subtitle="Connect your tools so AgentStack can respond to leads, sync your calendar, and manage follow-ups automatically."
              why="AgentStack needs these connections to capture and respond to inquiries in real time."
              minutes={3}
              requirement="Can skip"
            >
              <div className="space-y-3">
                {CONNECTIONS.map((c) => (
                  <ConnectRow
                    key={c.title}
                    icon={c.icon}
                    title={c.title}
                    desc={c.desc}
                    href={saPath(c.href)}
                    cta="Connect"
                  />
                ))}
              </div>
              <FooterNav
                onBack={back}
                onSkip={() => advance("skipped")}
                onContinue={() => advance("complete", ["sms"])}
              />
            </StepFrame>
          )}

          {step === 3 && (
            <StepFrame
              step={4}
              title="Choose your business goals"
              subtitle="Your goals shape what AgentStack prioritizes. We'll recommend the right systems and automations based on what matters most to you."
              why="Different goals require different systems. This helps us recommend the right lead capture, follow-up, and reporting."
              minutes={2}
              requirement="Can skip"
            >
              <div className="flex flex-col gap-3">
                {GOALS.map((g) => {
                  const selected = goals.has(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setGoals((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.id)) next.delete(g.id);
                          else next.add(g.id);
                          return next;
                        })
                      }
                      className={cn(
                        "flex items-start gap-4 rounded-2xl border bg-card p-5 text-left transition-all",
                        selected
                          ? "border-rose-500 ring-1 ring-rose-500/40"
                          : "hover:border-muted-foreground/30",
                      )}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <g.icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold">{g.title}</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">{g.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <FooterNav
                onBack={back}
                onSkip={() => advance("skipped")}
                onContinue={() => advance(goals.size ? "complete" : "skipped")}
              />
            </StepFrame>
          )}

          {step === 4 && (
            <StepFrame
              step={5}
              title="Launch recommended marketing"
              subtitle="Based on your goals, we recommend these proven lead capture systems. Each one is pre-built and ready to launch in one click."
              why="Launching even one system starts generating leads immediately. You can add more anytime."
              minutes={2}
              requirement="Can skip"
            >
              <div className="flex flex-col gap-3">
                {MARKETING_SYSTEMS.map((m) => {
                  const selected = systems.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setSystems((prev) => {
                          const next = new Set(prev);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        })
                      }
                      className={cn(
                        "flex items-start gap-4 rounded-2xl border bg-card p-5 text-left transition-all",
                        selected
                          ? "border-rose-500 ring-1 ring-rose-500/40"
                          : "hover:border-muted-foreground/30",
                      )}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <m.icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block font-semibold">{m.title}</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          Conversion: {m.conversion}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <FooterNav
                onBack={back}
                onSkip={() => advance("skipped")}
                onContinue={launchMarketingAndContinue}
                continueDisabled={launching}
                continueLabel={launching ? "Launching…" : "Continue"}
              />
            </StepFrame>
          )}

          {step === 5 && (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/40">
                <Rocket className="h-8 w-8 text-rose-600" />
              </div>
              <p className="mb-2 font-semibold text-rose-600">Step 6</p>
              <h1 className="text-4xl font-bold tracking-tight">You&apos;re ready to go live</h1>
              <p className="mx-auto mt-4 max-w-md text-lg text-muted-foreground">
                AgentStack is now configured around your business. Here&apos;s what&apos;s set up and
                ready to run:
              </p>

              <div className="mx-auto mt-8 max-w-lg space-y-3 text-left">
                {[
                  { label: "Business Brain", idx: 0 },
                  { label: "Import Contacts", idx: 1 },
                  { label: "Connect Business", idx: 2 },
                  { label: "Business Goals", idx: 3 },
                  { label: "Marketing Systems", idx: 4 },
                ].map((row) => {
                  const done = outcomes[row.idx] === "complete";
                  return (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded-2xl border bg-card px-5 py-4"
                    >
                      <span className="font-semibold">{row.label}</span>
                      <span
                        className={cn(
                          "flex items-center gap-1.5 text-sm",
                          done ? "text-emerald-600" : "text-muted-foreground",
                        )}
                      >
                        {done && <Check className="h-4 w-4" strokeWidth={3} />}
                        {done ? "Complete" : "Skipped"}
                      </span>
                    </div>
                  );
                })}
              </div>

              <p className="mt-8 text-sm text-muted-foreground">
                Click &ldquo;Go Live&rdquo; to start your dashboard. You can complete skipped steps
                anytime from your Business Brain.
              </p>

              <div className="mt-8 flex items-center justify-between border-t pt-8">
                <button
                  onClick={back}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={goLive}
                  className="rounded-full bg-foreground px-8 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
                >
                  Go Live
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Shared layout pieces
   ════════════════════════════════════════════════════════════ */

function StepFrame({
  step,
  title,
  subtitle,
  why,
  minutes,
  requirement,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  why: string;
  minutes: number;
  requirement: "Required" | "Can skip";
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 font-semibold text-rose-600">Step {step}</p>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-3 text-base text-muted-foreground">{subtitle}</p>

      <div className="mt-6 rounded-xl border bg-muted/40 px-5 py-4 text-sm leading-relaxed">
        <span className="font-semibold">Why we&apos;re asking:</span>{" "}
        <span className="text-muted-foreground">{why}</span>{" "}
        <span className="font-semibold">Estimated time:</span>{" "}
        <span className="text-muted-foreground">{minutes} minutes</span>
        <span className="text-muted-foreground"> · </span>
        <span className="font-semibold">{requirement}</span>
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}

function ConnectRow({
  icon: Icon,
  title,
  desc,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-card px-5 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
      <Link
        href={href}
        target="_blank"
        className="shrink-0 rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
      >
        {cta}
      </Link>
    </div>
  );
}

function FooterNav({
  onBack,
  onSkip,
  onContinue,
  continueDisabled,
  continueLabel = "Continue",
}: {
  onBack?: () => void;
  onSkip?: () => void;
  onContinue: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
}) {
  return (
    <div className="mt-10 flex items-center justify-between border-t pt-6">
      {onBack ? (
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-6">
        {onSkip && (
          <button
            onClick={onSkip}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip for now
          </button>
        )}
        <button
          onClick={onContinue}
          disabled={continueDisabled}
          className="flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {continueLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

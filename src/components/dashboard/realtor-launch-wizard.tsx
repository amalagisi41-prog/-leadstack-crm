"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Globe2,
  Loader2,
  Users,
  Building2,
  Target,
  Zap,
  Bot,
  Phone,
  Sparkles,
  Link2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";
import { readJson } from "@/lib/http/read-json";

/* ---------- types ---------- */

type RealtorRole = "solo_agent" | "team_lead" | "brokerage" | "other";
type LaunchPriority =
  | "get_leads"
  | "organize_database"
  | "build_website"
  | "ai_followup";

interface RealtorLaunchWizardProps {
  subAccountId: string;
  saPath: (p: string) => string;
}

type WizardScreen = 0 | 1 | 2 | 3 | 4;

const ROLE_OPTIONS: {
  value: RealtorRole;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "solo_agent",
    label: "Solo Agent",
    description: "Individual agent running your own book of business",
    icon: <Users className="h-5 w-5" />,
  },
  {
    value: "team_lead",
    label: "Team Lead",
    description: "Managing a small team of agents under one brand",
    icon: <Users className="h-5 w-5" />,
  },
  {
    value: "brokerage",
    label: "Brokerage",
    description: "Operating a brokerage with multiple agents",
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    value: "other",
    label: "Other",
    description: "Mortgage, title, property management, or another role",
    icon: <Globe2 className="h-5 w-5" />,
  },
];

const PRIORITY_OPTIONS: {
  value: LaunchPriority;
  label: string;
  description: string;
  icon: React.ReactNode;
  actionLabel: string;
  actionHref: string;
}[] = [
  {
    value: "get_leads",
    label: "Get more leads",
    description:
      "Set up lead capture forms and landing pages that feed straight into your pipeline",
    icon: <Target className="h-5 w-5 text-amber-500" />,
    actionLabel: "Build your first lead form",
    actionHref: SUB_ACCOUNT_ROUTES.forms,
  },
  {
    value: "organize_database",
    label: "Organize my database",
    description:
      "Import contacts from your old CRM and get everyone in one place",
    icon: <Users className="h-5 w-5 text-blue-500" />,
    actionLabel: "Import your contacts",
    actionHref: "/contacts?import=1",
  },
  {
    value: "build_website",
    label: "Build my website",
    description:
      "Launch a professional real estate site with IDX, listings, and local SEO",
    icon: <Globe2 className="h-5 w-5 text-emerald-500" />,
    actionLabel: "Open Website Studio",
    actionHref: SUB_ACCOUNT_ROUTES.websiteStudio,
  },
  {
    value: "ai_followup",
    label: "Set up AI follow-up",
    description:
      "Enable instant AI response so every lead gets a reply within 60 seconds",
    icon: <Bot className="h-5 w-5 text-violet-500" />,
    actionLabel: "Enable Speed-to-Lead",
    actionHref: SUB_ACCOUNT_ROUTES.workflows,
  },
];

/* ---------- main component ---------- */

export function RealtorLaunchWizard({
  subAccountId,
  saPath,
}: RealtorLaunchWizardProps) {
  const router = useRouter();
  const [screen, setScreen] = useState<WizardScreen>(0);
  const [role, setRole] = useState<RealtorRole | null>(null);
  const [priority, setPriority] = useState<LaunchPriority | null>(null);
  const [profileUrls, setProfileUrls] = useState("");
  const [importing, setImporting] = useState(false);
  const [profileImported, setProfileImported] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const back = useCallback(() => {
    setScreen((s) => Math.max(0, s - 1) as WizardScreen);
  }, []);

  const next = useCallback(() => {
    setScreen((s) => Math.min(4, s + 1) as WizardScreen);
  }, []);

  async function importProfile() {
    const urls = (profileUrls.match(/https?:\/\/[^\s]+/gi) ?? []).map((url) =>
      url.replace(/[),.;]+$/g, "")
    );
    if (urls.length === 0) {
      toast.error("Paste at least one public URL to import from.");
      return;
    }
    if (urls.length > 5) {
      toast.error("Import up to five links at a time.");
      return;
    }
    setImporting(true);
    try {
      let imported = 0;
      let lastError = "";
      for (const url of urls) {
        const response = await fetch(
          `/api/sub-accounts/${subAccountId}/business-profile/import`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          }
        );
        const data = await readJson<{ ok?: boolean }>(response);
        if (response.ok) imported += 1;
        else lastError = data.error ?? "Could not read that link.";
      }
      if (imported === 0)
        throw new Error(lastError || "Could not read those links.");
      setProfileImported(true);
      toast.success(
        `Imported ${imported} ${imported === 1 ? "page" : "pages"} as a draft for you to review.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function finishWizard() {
    if (finishing) return;
    setFinishing(true);
    try {
      // Save foundation as complete (fresh mode, minimal)
      await fetch(
        `/api/sub-accounts/${subAccountId}/onboarding-foundation`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "fresh",
            sourcePlatform: null,
            sourceUrl: "",
            domainStartingPoint: "need_domain",
            hostingStartingPoint: "keep_existing",
            domainSetupConfirmed: false,
            hostingSetupConfirmed: false,
            profileImported,
          }),
        }
      );

      // Save role and priority as custom metadata
      await fetch(`/api/sub-accounts/${subAccountId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: profileImported ? ["business_profile"] : [],
          wizardCompleted: true,
          realtorRole: role,
          launchPriority: priority,
        }),
      });

      const chosenPriority = PRIORITY_OPTIONS.find(
        (p) => p.value === priority
      );
      if (chosenPriority) {
        router.replace(saPath(chosenPriority.actionHref));
      } else {
        router.replace(saPath("/dashboard?welcome=1"));
      }
      router.refresh();
    } catch {
      setFinishing(false);
      toast.error(
        "Could not save your setup. Check your connection and try again."
      );
    }
  }

  const progressPercent = ((screen + 1) / 5) * 100;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* progress bar */}
      <div className="bg-muted h-1 w-full">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
        {/* header */}
        <div className="flex items-center justify-between">
          {screen > 0 ? (
            <button
              onClick={back}
              className="text-muted-foreground flex items-center gap-1 text-sm hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <div />
          )}
          <span className="text-muted-foreground text-sm">
            {screen + 1} of 5
          </span>
        </div>

        {/* screens */}
        {screen === 0 && (
          <ScreenRole role={role} onSelect={setRole} onNext={next} />
        )}
        {screen === 1 && (
          <ScreenPriority
            priority={priority}
            onSelect={setPriority}
            onNext={next}
          />
        )}
        {screen === 2 && (
          <ScreenIdentity
            profileUrls={profileUrls}
            onChangeUrls={setProfileUrls}
            importing={importing}
            profileImported={profileImported}
            onImport={importProfile}
            onNext={next}
          />
        )}
        {screen === 3 && (
          <ScreenConnect saPath={saPath} onNext={next} />
        )}
        {screen === 4 && (
          <ScreenLaunch
            priority={priority}
            saPath={saPath}
            finishing={finishing}
            onFinish={finishWizard}
          />
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Screen 1 — Role
   ════════════════════════════════════════════════════════════ */

function ScreenRole({
  role,
  onSelect,
  onNext,
}: {
  role: RealtorRole | null;
  onSelect: (r: RealtorRole) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Welcome to AgentStack
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          What kind of real estate business are you?
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This shapes how your workspace is configured — you can adjust
          everything later.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ROLE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
              role === option.value
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/30"
                : "bg-card hover:border-blue-300"
            )}
          >
            <div
              className={cn(
                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                role === option.value
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {option.icon}
            </div>
            <div>
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {option.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Button onClick={onNext} disabled={!role} size="lg">
        Continue <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Screen 2 — Priority
   ════════════════════════════════════════════════════════════ */

function ScreenPriority({
  priority,
  onSelect,
  onNext,
}: {
  priority: LaunchPriority | null;
  onSelect: (p: LaunchPriority) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Your first win
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          What&apos;s your #1 priority right now?
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          We&apos;ll get you to one useful result before this setup is over.
          Everything else is available from your workspace.
        </p>
      </div>

      <div className="space-y-3">
        {PRIORITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all",
              priority === option.value
                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/30"
                : "bg-card hover:border-blue-300"
            )}
          >
            <div
              className={cn(
                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                priority === option.value
                  ? "bg-blue-100 dark:bg-blue-900/50"
                  : "bg-muted"
              )}
            >
              {option.icon}
            </div>
            <div>
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {option.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      <Button onClick={onNext} disabled={!priority} size="lg">
        Continue <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Screen 3 — Identity (profile import)
   ════════════════════════════════════════════════════════════ */

function ScreenIdentity({
  profileUrls,
  onChangeUrls,
  importing,
  profileImported,
  onImport,
  onNext,
}: {
  profileUrls: string;
  onChangeUrls: (v: string) => void;
  importing: boolean;
  profileImported: boolean;
  onImport: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Your identity
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Where can we find you online?
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Paste your website, Google Business Profile, or social links. We&apos;ll
          pull your name, brokerage, headshot, and service areas into a draft
          Business Profile for you to review.
        </p>
      </div>

      <div className="space-y-3">
        <textarea
          value={profileUrls}
          onChange={(e) => onChangeUrls(e.target.value)}
          placeholder={"https://yourwebsite.com\nhttps://g.co/your-business-profile\nhttps://instagram.com/youragent"}
          rows={4}
          className="bg-background w-full rounded-xl border px-4 py-3 text-sm placeholder:text-muted-foreground/50"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onImport}
            disabled={importing || !profileUrls.trim()}
            variant="outline"
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {profileImported ? "Import again" : "Import my profile"}
          </Button>
          {profileImported && (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Draft ready for review
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onNext} size="lg">
          {profileImported ? "Continue" : "Skip for now"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {!profileImported && (
          <p className="text-muted-foreground text-xs">
            You can set up your Business Profile manually anytime.
          </p>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Screen 4 — Connect core accounts
   ════════════════════════════════════════════════════════════ */

function ScreenConnect({
  saPath,
  onNext,
}: {
  saPath: (p: string) => string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          Connect
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Connect your core accounts
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          These power AI responses, automated follow-up, and review management.
          Connect what you have — skip what you don&apos;t.
        </p>
      </div>

      <div className="space-y-3">
        <ConnectionCard
          icon={<Globe2 className="h-5 w-5 text-blue-500" />}
          title="Google Business Profile"
          description="Pull in your reviews, business info, and photos. Powers local SEO campaigns."
          href={saPath("/ai-agents/google-business")}
          cta="Connect Google"
        />
        <ConnectionCard
          icon={<Phone className="h-5 w-5 text-emerald-500" />}
          title="Phone Number (SMS)"
          description="Link a Twilio number so your AI agent can text leads within 60 seconds."
          href={saPath(SUB_ACCOUNT_ROUTES.messagingSettings)}
          cta="Set up SMS"
        />
        <ConnectionCard
          icon={<Link2 className="h-5 w-5 text-violet-500" />}
          title="Email & Calendar"
          description="Connect Gmail or Outlook for email sync and automated booking."
          href={saPath("/dashboard/settings?tab=messaging#business-email")}
          cta="Connect email"
        />
      </div>

      <Button onClick={onNext} size="lg">
        Continue <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      <p className="text-muted-foreground text-xs">
        All connections are optional. You can add them anytime from Settings.
      </p>
    </div>
  );
}

function ConnectionCard({
  icon,
  title,
  description,
  href,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="bg-card flex items-center gap-4 rounded-xl border p-4">
      <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
      <Button size="sm" variant="outline" render={<Link href={href} />}>
        {cta}
        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Screen 5 — Launch (one action based on priority)
   ════════════════════════════════════════════════════════════ */

function ScreenLaunch({
  priority,
  saPath,
  finishing,
  onFinish,
}: {
  priority: LaunchPriority | null;
  saPath: (p: string) => string;
  finishing: boolean;
  onFinish: () => void;
}) {
  const chosen = PRIORITY_OPTIONS.find((p) => p.value === priority);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
          You&apos;re ready
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Your workspace is set up.
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Everything is configured. Your AI agent knows your business. Your
          pipeline is ready. One thing left — your first action.
        </p>
      </div>

      {chosen && (
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5 dark:border-blue-800 dark:bg-blue-950/30">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
              {chosen.icon}
            </div>
            <div>
              <p className="text-xs font-medium tracking-wider text-blue-600 uppercase dark:text-blue-400">
                Your #1 priority
              </p>
              <p className="mt-1 font-semibold">{chosen.label}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {chosen.description}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm font-medium">What&apos;s next in your workspace</p>
        <div className="mt-3 space-y-2">
          {[
            "Your Business Profile is ready to review and refine",
            "Your deal pipeline tracks leads from first contact to close",
            "AI follow-up is pre-configured with your info",
            "Domain and website setup available when you're ready",
          ].map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span className="text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      </div>

      <Button size="lg" onClick={onFinish} disabled={finishing}>
        {finishing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Zap className="mr-2 h-4 w-4" />
        )}
        {finishing
          ? "Opening your workspace…"
          : chosen
            ? chosen.actionLabel
            : "Go to my workspace"}
        {!finishing && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
    </div>
  );
}

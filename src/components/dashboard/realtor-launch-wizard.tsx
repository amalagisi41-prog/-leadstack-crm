"use client";

import { useState, useCallback } from "react";
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
  Bot,
  Sparkles,
  MapPin,
  Share2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";
import { readJson } from "@/lib/http/read-json";
import type {
  LaunchPriority as LaunchPriorityAnswer,
  RealtorRole as RealtorRoleAnswer,
} from "@/types/onboarding-answers";
import type { SubAccountDoc } from "@/types/tenancy";

/* ---------- types ---------- */

type RealtorRole = RealtorRoleAnswer;
type LaunchPriority = LaunchPriorityAnswer;
type SetupPath = "website" | "listings" | "presence" | "leads" | "automation" | "ai" | "dashboard";

interface RealtorLaunchWizardProps {
  subAccountId: string;
  saPath: (p: string) => string;
  initialRole?: RealtorRole | null;
  initialPriority?: LaunchPriority | null;
  subAccount?: SubAccountDoc | null;
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
}[] = [
  {
    value: "get_leads",
    label: "Get more leads",
    description: "Turn your website, listings, forms, and follow-up into a lead engine.",
    icon: <Target className="h-5 w-5 text-amber-500" />,
  },
  {
    value: "organize_database",
    label: "Organize my database",
    description: "Bring contacts and active opportunities into one place.",
    icon: <Users className="h-5 w-5 text-blue-500" />,
  },
  {
    value: "build_website",
    label: "Build or connect my website",
    description: "Get your brand, domain, listings, and public presence working together.",
    icon: <Globe2 className="h-5 w-5 text-emerald-500" />,
  },
  {
    value: "ai_followup",
    label: "Set up AI follow-up",
    description: "Let AgentStack respond, qualify, nurture, and help book appointments.",
    icon: <Bot className="h-5 w-5 text-violet-500" />,
  },
];

const CONNECT_OPTIONS: {
  value: Extract<SetupPath, "website" | "listings" | "presence">;
  label: string;
  description: string;
  guidance: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "website",
    label: "Website + domain",
    description: "Use your own web address and make your existing site work with AgentStack.",
    guidance: "AgentStack will show you exactly what to change. Your domain stays with your current provider.",
    icon: <Globe2 className="h-5 w-5" />,
  },
  {
    value: "listings",
    label: "Listings + MLS",
    description: "Bring MLS/IDX and agent-managed properties into one listing inventory.",
    guidance: "We'll ask which listing source you already use and guide you to the right connection.",
    icon: <MapPin className="h-5 w-5" />,
  },
  {
    value: "presence",
    label: "Google + social",
    description: "Connect the public accounts people already use to find and contact you.",
    guidance: "Sign in with the provider when authorization is required. AgentStack never needs your social password.",
    icon: <Share2 className="h-5 w-5" />,
  },
];

const NEXT_OPTIONS: {
  value: Extract<SetupPath, "leads" | "automation" | "ai">;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "leads",
    label: "Capture and organize leads",
    description: "Start with forms, contacts, and a clear pipeline so every inquiry has a next step.",
    icon: <Target className="h-5 w-5" />,
  },
  {
    value: "automation",
    label: "Automate follow-up",
    description: "Set the rules that keep new leads moving without manual reminders.",
    icon: <Workflow className="h-5 w-5" />,
  },
  {
    value: "ai",
    label: "Turn on AI",
    description: "Use your Business Blueprint to guide AI responses, qualification, and booking.",
    icon: <Bot className="h-5 w-5" />,
  },
];

function priorityPath(priority: LaunchPriority | null): SetupPath | null {
  switch (priority) {
    case "get_leads":
      return "leads";
    case "organize_database":
      return "leads";
    case "build_website":
      return "website";
    case "ai_followup":
      return "ai";
    default:
      return null;
  }
}

function pathHref(path: SetupPath): string {
  switch (path) {
    case "website":
      return SUB_ACCOUNT_ROUTES.domain;
    case "listings":
      return SUB_ACCOUNT_ROUTES.listings;
    case "presence":
      return SUB_ACCOUNT_ROUTES.businessProfile;
    case "leads":
      return SUB_ACCOUNT_ROUTES.forms;
    case "automation":
      return SUB_ACCOUNT_ROUTES.workflows;
    case "ai":
      return SUB_ACCOUNT_ROUTES.aiAgents;
    default:
      return SUB_ACCOUNT_ROUTES.dashboard;
  }
}

/* ---------- main component ---------- */

export function RealtorLaunchWizard({
  subAccountId,
  saPath,
  initialRole = null,
  initialPriority = null,
}: RealtorLaunchWizardProps) {
  const router = useRouter();
  const [screen, setScreen] = useState<WizardScreen>(() => {
    if (!initialRole) return 0;
    if (!initialPriority) return 1;
    return 2;
  });
  const [role, setRole] = useState<RealtorRole | null>(initialRole);
  const [priority, setPriority] = useState<LaunchPriority | null>(initialPriority);
  const [profileUrls, setProfileUrls] = useState("");
  const [importing, setImporting] = useState(false);
  const [profileImported, setProfileImported] = useState(false);
  const [connectPath, setConnectPath] = useState<Extract<SetupPath, "website" | "listings" | "presence"> | null>(null);
  const [nextPath, setNextPath] = useState<Extract<SetupPath, "leads" | "automation" | "ai"> | null>(null);
  const [finishing, setFinishing] = useState(false);

  const back = useCallback(() => {
    setScreen((s) => Math.max(0, s - 1) as WizardScreen);
  }, []);

  const next = useCallback(() => {
    setScreen((s) => Math.min(4, s + 1) as WizardScreen);
  }, []);

  const saveAnswers = useCallback(
    (answers: { realtorRole?: RealtorRole; launchPriority?: LaunchPriority }) => {
      void fetch(`/api/sub-accounts/${subAccountId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      }).catch(() => undefined);
    },
    [subAccountId]
  );

  async function importProfile() {
    const urls = (profileUrls.match(/https?:\\/\\/[^\\s]+/gi) ?? []).map((url) =>
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
        const data = await readJson<{ ok?: boolean; error?: string }>(response);
        if (response.ok && data.ok === true) imported += 1;
        else lastError = data.error ?? "Could not read that link.";
      }
      if (imported === 0) throw new Error(lastError || "Could not read those links.");
      setProfileImported(true);
      toast.success(`Imported ${imported} ${imported === 1 ? "page" : "pages"} as a draft for you to review.`);
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
      const foundationResponse = await fetch(
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

      if (!foundationResponse.ok) {
        const data = await readJson<{ error?: string }>(foundationResponse);
        throw new Error(data.error ?? "Could not save your setup foundation.");
      }

      const onboardingResponse = await fetch(`/api/sub-accounts/${subAccountId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: [],
          wizardCompleted: true,
          realtorRole: role,
          launchPriority: priority,
        }),
      });
      if (!onboardingResponse.ok) {
        const data = await readJson<{ error?: string }>(onboardingResponse);
        throw new Error(data.error ?? "Could not save your onboarding choices.");
      }

      const destination = nextPath ?? connectPath ?? priorityPath(priority) ?? "dashboard";
      router.replace(saPath(pathHref(destination)));
      router.refresh();
    } catch (error) {
      setFinishing(false);
      toast.error(error instanceof Error ? error.message : "Could not save your setup. Check your connection and try again.");
    }
  }

  const progressPercent = ((screen + 1) / 5) * 100;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="bg-muted h-1 w-full">
        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
        <div className="flex items-center justify-between">
          {screen > 0 ? (
            <button onClick={back} className="text-muted-foreground flex items-center gap-1 text-sm hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : <div />}
          <span className="text-muted-foreground text-sm">{screen + 1} of 5</span>
        </div>

        {screen === 0 && (
          <ScreenRole
            role={role}
            onSelect={(r) => {
              setRole(r);
              saveAnswers({ realtorRole: r });
            }}
            onNext={next}
          />
        )}
        {screen === 1 && (
          <ScreenPriority
            priority={priority}
            onSelect={(p) => {
              setPriority(p);
              saveAnswers({ launchPriority: p });
            }}
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
          <ScreenConnect
            selected={connectPath}
            onSelect={setConnectPath}
            onNext={next}
          />
        )}
        {screen === 4 && (
          <ScreenNext
            selected={nextPath}
            onSelect={setNextPath}
            priority={priority}
            connectPath={connectPath}
            finishing={finishing}
            onFinish={finishWizard}
          />
        )}
      </div>
    </div>
  );
}

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
        <p className="text-primary text-sm font-semibold tracking-wider uppercase">Welcome to AgentStack</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">First, what kind of business are you running?</h1>
        <p className="text-muted-foreground mt-2 text-sm">A couple of answers help AS point you to the right setup. You can change anything later.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ROLE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
              role === option.value ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/30" : "bg-card hover:border-blue-300"
            )}
          >
            <div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", role === option.value ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50" : "bg-muted text-muted-foreground")}>
              {option.icon}
            </div>
            <div>
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{option.description}</p>
            </div>
          </button>
        ))}
      </div>

      <Button onClick={onNext} disabled={!role} size="lg">Continue <ArrowRight className="ml-2 h-4 w-4" /></Button>
    </div>
  );
}

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
        <p className="text-primary text-sm font-semibold tracking-wider uppercase">Question 2</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">What do you want AgentStack to help with first?</h1>
        <p className="text-muted-foreground mt-2 text-sm">We'll use your answer to put the fastest path in front of you — not make you configure everything.</p>
      </div>

      <div className="space-y-3">
        {PRIORITY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all",
              priority === option.value ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/30" : "bg-card hover:border-blue-300"
            )}
          >
            <div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", priority === option.value ? "bg-blue-100 dark:bg-blue-900/50" : "bg-muted")}>
              {option.icon}
            </div>
            <div>
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{option.description}</p>
            </div>
          </button>
        ))}
      </div>

      <Button onClick={onNext} disabled={!priority} size="lg">Continue <ArrowRight className="ml-2 h-4 w-4" /></Button>
    </div>
  );
}

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
        <p className="text-primary text-sm font-semibold tracking-wider uppercase">Question 3</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Where does your business already live online?</h1>
        <p className="text-muted-foreground mt-2 text-sm">Give AS a website, Google Business Profile, or social link. We'll use public information to prepare your Business Blueprint draft.</p>
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
          <Button onClick={onImport} disabled={importing || !profileUrls.trim()} variant="outline">
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {profileImported ? "Import again" : "Let AS prepare my profile"}
          </Button>
          {profileImported && (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Draft prepared — review it in Business Blueprint
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onNext} size="lg">
          {profileImported ? "Continue" : "Skip for now"} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {!profileImported && <p className="text-muted-foreground text-xs">You can answer this later in Business Blueprint.</p>}
      </div>
    </div>
  );
}

function ScreenConnect({
  selected,
  onSelect,
  onNext,
}: {
  selected: Extract<SetupPath, "website" | "listings" | "presence"> | null;
  onSelect: (path: Extract<SetupPath, "website" | "listings" | "presence">) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-primary text-sm font-semibold tracking-wider uppercase">Question 4 · Connect</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">What should we connect first?</h1>
        <p className="text-muted-foreground mt-2 text-sm">AS will take you to the right place and tell you what to do. Pick the piece that matters most — you do not need to connect everything today.</p>
      </div>

      <div className="space-y-3">
        {CONNECT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all",
              selected === option.value ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/30" : "bg-card hover:border-blue-300"
            )}
          >
            <div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", selected === option.value ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50" : "bg-muted text-muted-foreground")}>
              {option.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-muted-foreground mt-1 text-sm">{option.description}</p>
              <p className="text-muted-foreground mt-1.5 text-xs">{option.guidance}</p>
            </div>
          </button>
        ))}
      </div>

      <Button onClick={onNext} disabled={!selected} size="lg">Continue <ArrowRight className="ml-2 h-4 w-4" /></Button>
    </div>
  );
}

function ScreenNext({
  selected,
  onSelect,
  priority,
  connectPath,
  finishing,
  onFinish,
}: {
  selected: Extract<SetupPath, "leads" | "automation" | "ai"> | null;
  onSelect: (path: Extract<SetupPath, "leads" | "automation" | "ai">) => void;
  priority: LaunchPriority | null;
  connectPath: Extract<SetupPath, "website" | "listings" | "presence"> | null;
  finishing: boolean;
  onFinish: () => void;
}) {
  const suggested = priorityPath(priority);
  const effectiveSelection = selected ?? (suggested && ["leads", "automation", "ai"].includes(suggested) ? suggested as Extract<SetupPath, "leads" | "automation" | "ai"> : null);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-primary text-sm font-semibold tracking-wider uppercase">Question 5 · Keep it moving</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">What should AgentStack help you do next?</h1>
        <p className="text-muted-foreground mt-2 text-sm">Your answers tell AS where to start. Pick one outcome and we'll take you there — the rest can evolve as your business does.</p>
      </div>

      <div className="space-y-3">
        {NEXT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onSelect(option.value)}
            className={cn(
              "flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all",
              effectiveSelection === option.value ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20 dark:bg-blue-950/30" : "bg-card hover:border-blue-300"
            )}
          >
            <div className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", effectiveSelection === option.value ? "bg-blue-100 text-blue-600 dark:bg-blue-900/50" : "bg-muted text-muted-foreground")}>
              {option.icon}
            </div>
            <div>
              <p className="text-sm font-medium">{option.label}</p>
              <p className="text-muted-foreground mt-1 text-sm">{option.description}</p>
            </div>
          </button>
        ))}
      </div>

      {connectPath && (
        <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm">
          <p className="font-medium">Your first connection: {CONNECT_OPTIONS.find((option) => option.value === connectPath)?.label}</p>
          <p className="text-muted-foreground mt-1">After this question, AS will open the setup for that connection. You can return here anytime.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onFinish} disabled={finishing} size="lg">
          {finishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
          {finishing ? "Opening your next step…" : "Take me there"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            if (finishing) return;
            // Let the user intentionally choose a clean workspace home without
            // adding another onboarding requirement.
            onSelect("leads");
            window.setTimeout(onFinish, 0);
          }}
          disabled={finishing}
        >
          Go to Today
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        No launch checklist. No setup score. AgentStack stays available while you work.
      </p>
    </div>
  );
}

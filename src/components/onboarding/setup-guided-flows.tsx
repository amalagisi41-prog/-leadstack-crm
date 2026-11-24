"use client";

import { useCallback, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  SkipForward,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GuidedFlow,
  type GuidedAnswers,
  type GuidedStep,
} from "@/components/guided-flow/guided-flow";
import { googleAccountConnectPath } from "@/lib/google/account-connect-path";
import { commsFlowStepIds, socialFlowStepIds } from "@/lib/onboarding/guided-setup-flows";
import { SETUP_VIDEOS } from "@/lib/onboarding/setup-progress";
import type { SubAccountDoc } from "@/types/tenancy";

async function skipSetupStep(subAccount: SubAccountDoc, subAccountId: string, step: string) {
  const skippedSteps = Array.from(new Set([...(subAccount.setupSkippedSteps ?? []), step]));
  const res = await fetch(`/api/sub-accounts/${subAccountId}/onboarding`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skippedSteps }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Could not skip that step.");
  }
}

function OutlookButton({ subAccountId }: { subAccountId: string }) {
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/calendar/outlook-oauth`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as { authUrl?: string; error?: string };
      if (!res.ok || !data.authUrl) throw new Error(data.error ?? "Could not start Microsoft sign-in.");
      window.location.assign(data.authUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start Microsoft sign-in.");
      setBusy(false);
    }
  }
  return (
    <Button onClick={start} disabled={busy}>
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
      Sign in with Microsoft
    </Button>
  );
}

function TwilioForm({ subAccountId, connected }: { subAccountId: string; connected: boolean }) {
  const [form, setForm] = useState({ accountSid: "", authToken: "", fromNumber: "" });
  const [saving, setSaving] = useState(false);

  if (connected) {
    return (
      <p className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> Your phone number is connected.
      </p>
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/twilio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not connect that number.");
      toast.success("Phone number connected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect that number.");
    } finally {
      setSaving(false);
    }
  }

  const ready = form.accountSid.trim() && form.authToken.trim() && form.fromNumber.trim();
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        Log in at{" "}
        <a className="underline" href="https://console.twilio.com" target="_blank" rel="noreferrer">
          console.twilio.com
        </a>
        . The Account SID and Auth Token are on the home screen; your number is under Phone Numbers →
        Active numbers.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="guided-twilio-sid">Account SID (starts with AC)</Label>
        <Input
          id="guided-twilio-sid"
          value={form.accountSid}
          onChange={(e) => setForm((f) => ({ ...f, accountSid: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guided-twilio-token">Auth Token</Label>
        <Input
          id="guided-twilio-token"
          type="password"
          value={form.authToken}
          onChange={(e) => setForm((f) => ({ ...f, authToken: e.target.value }))}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="guided-twilio-number">Phone number</Label>
        <Input
          id="guided-twilio-number"
          value={form.fromNumber}
          placeholder="+15551234567"
          onChange={(e) => setForm((f) => ({ ...f, fromNumber: e.target.value }))}
        />
      </div>
      <Button onClick={save} disabled={saving || !ready}>
        {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
        Connect my number
      </Button>
    </div>
  );
}

function SkipButton({
  subAccount,
  subAccountId,
  step,
  onDone,
}: {
  subAccount: SubAccountDoc;
  subAccountId: string;
  step: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function skip() {
    setBusy(true);
    try {
      await skipSetupStep(subAccount, subAccountId, step);
      toast.success("Skipped for now — you can connect it any time from Connect.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not skip that step.");
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" onClick={skip} disabled={busy}>
      {busy ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <SkipForward className="mr-1.5 h-4 w-4" />
      )}
      Skip this step for now
    </Button>
  );
}

const STEP_PROMPTS: Record<"identity" | "listings" | "domain", { title: string; why: string }> = {
  identity: {
    title: "First, tell us about your business",
    why: "Your business name, license number, and service area go on everything AgentStack writes for you, so this comes first.",
  },
  listings: {
    title: "Connect your listings",
    why: "Your listings power property pages, campaigns, and marketing drafts. Connect your IDX Broker account so they show up here automatically.",
  },
  domain: {
    title: "Connect your domain",
    why: "Put your website on your own web address, like yourname.com.",
  },
};

/**
 * One-screen pop-up for a setup step that doesn't have its own question
 * flow yet: says why it matters and takes them straight to it.
 */
export function SetupStepPrompt({
  step,
  open,
  onOpenChange,
  setupHref,
}: {
  step: keyof typeof STEP_PROMPTS;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setupHref: string;
}) {
  const buildSteps = useCallback(
    (): GuidedStep[] => [
      {
        id: step,
        title: STEP_PROMPTS[step].title,
        final: true,
        body: () => (
          <div className="space-y-3">
            <p>{STEP_PROMPTS[step].why}</p>
            <Button render={<a href={setupHref} />}>Set it up now</Button>
          </div>
        ),
      },
    ],
    [setupHref, step],
  );
  return (
    <GuidedFlow
      open={open}
      onOpenChange={onOpenChange}
      steps={buildSteps}
      finishLabel="Not now"
      video={SETUP_VIDEOS[step]}
    />
  );
}

interface FlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subAccountId: string;
  subAccount: SubAccountDoc;
}

export function CommunicationsGuidedSetup({ open, onOpenChange, subAccountId, subAccount }: FlowProps) {
  const twilioConnected = subAccount.twilioConfig?.enabled === true;

  const buildSteps = useCallback(
    (answers: GuidedAnswers): GuidedStep[] => {
      const all: Record<string, GuidedStep> = {
        provider: {
          id: "provider",
          title: "How do your leads usually reach you?",
          description: "Pick the one you check most. You can add the others later.",
          choices: [
            { id: "google", label: "Gmail", description: "Including Google Workspace email", icon: Mail },
            { id: "outlook", label: "Outlook", description: "Including Microsoft 365 email", icon: Mail },
            { id: "phone", label: "Text messages", description: "A business phone number", icon: Phone },
            { id: "unsure", label: "I'm not sure", icon: HelpCircle },
          ],
        },
        "which-email": {
          id: "which-email",
          title: "Which email do you use for work?",
          description: "Look at the address you give clients — the part after the @ usually tells you.",
          choices: [
            { id: "gmail", label: "Gmail", description: "@gmail.com, or my own domain on Google" },
            { id: "outlook", label: "Outlook", description: "@outlook.com, @hotmail.com, or Microsoft 365" },
            { id: "neither", label: "Neither — clients text me", icon: MessageSquare },
          ],
        },
        "google-connect": {
          id: "google-connect",
          title: "Sign in with Google",
          final: true,
          body: () => (
            <div className="space-y-3">
              <p>
                Google will ask you to choose your account and approve access. You&apos;ll come right
                back here, and this step will tick off on its own once Google confirms.
              </p>
              <Button render={<a href={googleAccountConnectPath(subAccountId)} />}>Sign in with Google</Button>
            </div>
          ),
        },
        "outlook-connect": {
          id: "outlook-connect",
          title: "Sign in with Microsoft",
          final: true,
          body: () => (
            <div className="space-y-3">
              <p>
                Microsoft will ask you to sign in and approve access. You&apos;ll come right back here,
                and this step will tick off on its own once Microsoft confirms.
              </p>
              <OutlookButton subAccountId={subAccountId} />
            </div>
          ),
        },
        "has-twilio": {
          id: "has-twilio",
          title: "Do you already have a Twilio account?",
          description:
            "AgentStack texts through Twilio, a phone service. If you've never heard of it, the answer is probably no.",
          choices: [
            { id: "yes", label: "Yes, I have Twilio and a phone number" },
            { id: "no", label: "No, or I'm not sure" },
          ],
        },
        "twilio-form": {
          id: "twilio-form",
          title: "Connect your Twilio number",
          final: true,
          body: () => <TwilioForm subAccountId={subAccountId} connected={twilioConnected} />,
        },
        "no-twilio": {
          id: "no-twilio",
          title: "Start with email instead",
          description:
            "Texting needs a paid Twilio account, which takes some setup. Most agents connect email first and add texting later.",
          choices: [
            { id: "google", label: "Connect Gmail", icon: Mail },
            { id: "outlook", label: "Connect Outlook", icon: Mail },
            { id: "later", label: "I'll come back to this", icon: SkipForward },
          ],
        },
        later: {
          id: "later",
          title: "No problem",
          final: true,
          body: () => (
            <p>
              This step stays on your setup list so it&apos;s easy to find. Click the setup button at
              the bottom of any page when you&apos;re ready.
            </p>
          ),
        },
      };
      return commsFlowStepIds(answers).map((id) => all[id]);
    },
    [subAccountId, twilioConnected],
  );

  return <GuidedFlow open={open} onOpenChange={onOpenChange} steps={buildSteps} video={SETUP_VIDEOS.communications} />;
}

export function SocialGuidedSetup({ open, onOpenChange, subAccountId, subAccount }: FlowProps) {
  const gateOn =
    subAccount.metaInboxEnabledByAgency === true || subAccount.socialPlannerEnabledByAgency === true;

  const buildSteps = useCallback(
    (answers: GuidedAnswers): GuidedStep[] => {
      const close = () => onOpenChange(false);
      const all: Record<string, GuidedStep> = {
        "gate-off": {
          id: "gate-off",
          title: "Facebook & Instagram aren't turned on yet",
          final: true,
          body: () => (
            <div className="space-y-3">
              <p>
                Your agency controls whether this workspace can connect Facebook and Instagram, and
                it&apos;s currently off. Ask your agency to turn on &ldquo;Facebook + Instagram
                inbox&rdquo; or &ldquo;Social Planner&rdquo; for you, or skip it for now.
              </p>
              <SkipButton subAccount={subAccount} subAccountId={subAccountId} step="social" onDone={close} />
            </div>
          ),
        },
        "has-page": {
          id: "has-page",
          title: "Do you have a Facebook Page for your real estate business?",
          description: "A Page is the business profile — separate from your personal Facebook profile.",
          choices: [
            { id: "yes", label: "Yes, I have a business Page" },
            { id: "no", label: "No, only a personal profile" },
            { id: "unsure", label: "I'm not sure" },
            { id: "skip", label: "Skip Facebook & Instagram for now", icon: SkipForward },
          ],
        },
        "create-page": {
          id: "create-page",
          title: "Create your business Page",
          body: () => (
            <div className="space-y-3">
              <p>
                It takes about two minutes: give it your business name, choose the category
                &ldquo;Real Estate Agent&rdquo;, and add a profile photo.
              </p>
              <Button
                variant="outline"
                render={<a href="https://www.facebook.com/pages/create" target="_blank" rel="noreferrer" />}
              >
                Open Facebook Page setup <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          ),
          continueLabel: "I've created my Page",
        },
        "has-instagram": {
          id: "has-instagram",
          title: "What kind of Instagram account do you have?",
          description: "In the Instagram app, open your profile → Settings to check.",
          choices: [
            { id: "business", label: "Business or Creator account" },
            { id: "personal", label: "Personal account" },
            { id: "none", label: "I don't use Instagram", description: "Facebook alone works fine" },
            { id: "unsure", label: "I'm not sure" },
          ],
        },
        "switch-ig": {
          id: "switch-ig",
          title: "Switch Instagram to a professional account",
          body: () => (
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>In the Instagram app, open your profile and tap the menu.</li>
              <li>Open account settings and find the option to switch to a professional account.</li>
              <li>Choose Business, pick the &ldquo;Real Estate Agent&rdquo; category, and link it to your Facebook Page when asked.</li>
              <li className="text-muted-foreground text-xs">
                Instagram renames these menus from time to time — if you can&apos;t find it, search
                &ldquo;professional account&rdquo; in Instagram&apos;s settings.
              </li>
            </ol>
          ),
          continueLabel: "Done",
        },
        connect: {
          id: "connect",
          title: "Connect to AgentStack",
          final: true,
          body: () => (
            <div className="space-y-3">
              <p>Facebook will open and ask a few questions. Two things matter:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Choose your business Page when asked which Pages to use.</li>
                <li>Leave every permission switched on — turning one off stops posting or messages from working.</li>
              </ul>
              <p className="text-muted-foreground text-xs">
                You&apos;ll come back here, and this step will tick off on its own once Facebook confirms.
              </p>
              <Button render={<a href={`/api/sub-accounts/${subAccountId}/meta/connect`} />}>
                Connect Facebook & Instagram
              </Button>
            </div>
          ),
        },
        skip: {
          id: "skip",
          title: "Skip Facebook & Instagram?",
          final: true,
          body: () => (
            <div className="space-y-3">
              <p>You can connect them any time from the Connect page.</p>
              <SkipButton subAccount={subAccount} subAccountId={subAccountId} step="social" onDone={close} />
            </div>
          ),
        },
      };
      return socialFlowStepIds(answers, gateOn).map((id) => all[id]);
    },
    [gateOn, onOpenChange, subAccount, subAccountId],
  );

  return <GuidedFlow open={open} onOpenChange={onOpenChange} steps={buildSteps} video={SETUP_VIDEOS.social} />;
}

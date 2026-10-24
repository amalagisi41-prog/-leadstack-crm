"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Lock,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WelcomeVideoDialog } from "@/components/onboarding/welcome-video-dialog";
import { googleAccountConnectPath } from "@/lib/google/account-connect-path";
import type { SubAccountDoc } from "@/types/tenancy";
import {
  SETUP_STEP_ORDER,
  SETUP_STEP_TITLES,
  WELCOME_VIDEO,
  deriveSetupStepStates,
  type SetupStepId,
  type SetupStepState,
} from "@/lib/onboarding/setup-progress";

/**
 * Account-first setup — the locked-step replacement for the old "Connect &
 * Set Up" sidebar group and the Realtor Launch Wizard it used to show new
 * workspaces. Mirrors this repo's own DomainConnect/DnsCutoverWizard
 * convention rather than a shadcn Dialog popup: numbered steps that stay
 * visible-but-locked, each one's lock/done state DERIVED from real
 * persisted facts (twilioConfig, googleAccountConfig, idxConfig, metaConfig,
 * customDomain) rather than a stored step pointer — the
 * same reason DomainConnect and lib/onboarding/completion.ts never store a
 * "current step" field. See the Client Journey Re-plan doc, "Setup as a
 * modal, not a place."
 *
 * Steps, in the doc's own order: Identity -> Communications account ->
 * Listings source -> Social -> Domain. Identity and
 * Communications account are mandatory (everything downstream needs them);
 * the last three are individually skippable, since not every workspace has
 * IDX or Meta gated on, and Domain is optional by design.
 */

type StepId = SetupStepId;
const STEP_ORDER = SETUP_STEP_ORDER;
const STEP_TITLES = SETUP_STEP_TITLES;

interface BusinessProfileFields {
  brokerage: string;
  licenseNumber: string;
  serviceAreas: string;
}

export { deriveSetupStepStates };
export type { SetupStepState };

function StepHeader({
  step,
  title,
  description,
  state,
}: {
  step: number;
  title: string;
  description: string;
  state: "done" | "active" | "locked";
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          state === "done"
            ? "bg-emerald-600 text-white"
            : state === "active"
              ? "bg-blue-700 text-white"
              : "bg-slate-200 text-slate-500"
        }`}
      >
        {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : step}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {state === "locked" ? (
            <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold dark:bg-slate-800">
              <Lock className="h-3 w-3" /> Locked
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 text-sm leading-5">
          {description}
        </p>
      </div>
    </div>
  );
}

/** One prerequisite line, so "locked" says what is missing rather than just showing a padlock. */
function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {met ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-slate-300" />
      )}
      <span className={met ? "text-slate-700 dark:text-slate-300" : "text-muted-foreground"}>
        {label}
      </span>
    </li>
  );
}

async function patchOnboarding(
  subAccountId: string,
  body: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`/api/sub-accounts/${subAccountId}/onboarding`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Could not save that.");
  }
}

export function SetupModal({
  subAccountId,
  subAccount,
  saPath,
}: {
  subAccountId: string;
  subAccount: SubAccountDoc;
  saPath: (path: string) => string;
}) {
  const router = useRouter();

  // --- Identity ---
  const [profile, setProfile] = useState<BusinessProfileFields | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [identityForm, setIdentityForm] = useState<BusinessProfileFields>({
    brokerage: "",
    licenseNumber: "",
    serviceAreas: "",
  });
  const [savingIdentity, setSavingIdentity] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/sub-accounts/${subAccountId}/business-profile`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { profile?: BusinessProfileFields };
        if (!active || !data.profile) return;
        const fields: BusinessProfileFields = {
          brokerage: data.profile.brokerage ?? "",
          licenseNumber: data.profile.licenseNumber ?? "",
          serviceAreas: data.profile.serviceAreas ?? "",
        };
        setProfile(fields);
        setIdentityForm(fields);
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subAccountId]);

  const identityDone = Boolean(
    profile?.brokerage.trim() &&
      profile?.licenseNumber.trim() &&
      profile?.serviceAreas.trim()
  );

  async function saveIdentity() {
    setSavingIdentity(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/business-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identityForm),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not save your identity.");
      }
      setProfile(identityForm);
      toast.success("Identity saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSavingIdentity(false);
    }
  }

  // --- Communications account ---
  const commsDone =
    subAccount.twilioConfig?.enabled === true ||
    subAccount.googleAccountConfig?.status === "connected" ||
    subAccount.calendarConfig?.status === "connected";
  const [connectingOutlook, setConnectingOutlook] = useState(false);
  const [smsForm, setSmsForm] = useState({
    accountSid: "",
    authToken: "",
    fromNumber: "",
  });
  const [savingSms, setSavingSms] = useState(false);
  const [phonePanelOpen, setPhonePanelOpen] = useState(false);

  async function connectOutlook() {
    setConnectingOutlook(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/calendar/outlook-oauth`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        authUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.authUrl) {
        throw new Error(data.error ?? "Could not start Microsoft sign-in.");
      }
      window.location.assign(data.authUrl);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start Microsoft sign-in."
      );
      setConnectingOutlook(false);
    }
  }

  async function saveSms() {
    setSavingSms(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/twilio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(smsForm),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not connect that number.");
      toast.success("Phone number connected.");
      setPhonePanelOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect that number.");
    } finally {
      setSavingSms(false);
    }
  }

  // --- Listings source (IDX) ---
  const listingsGateOn = subAccount.idxEnabledByAgency === true;
  const listingsDone = subAccount.idxConfig?.enabled === true;
  const [idxForm, setIdxForm] = useState({ accessKey: "", mlsId: "" });
  const [savingIdx, setSavingIdx] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function saveIdx() {
    setSavingIdx(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/idx/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKey: idxForm.accessKey || undefined,
          mlsId: idxForm.mlsId || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not connect IDX Broker.");
      toast.success("IDX Broker connected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect IDX Broker.");
    } finally {
      setSavingIdx(false);
    }
  }

  async function testSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/idx/sync`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        listingCount?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      setSyncMessage(`Synced ${data.listingCount ?? 0} listing(s).`);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  // --- Social (Meta) ---
  const socialGateOn =
    subAccount.metaInboxEnabledByAgency === true ||
    subAccount.socialPlannerEnabledByAgency === true;
  const socialDone = subAccount.metaConfig?.connected === true;



  // --- Domain ---
  const domainDone = Boolean(subAccount.customDomain);
  const [domainInput, setDomainInput] = useState(subAccount.customDomain ?? "");
  const [savingDomain, setSavingDomain] = useState(false);

  async function saveDomain() {
    setSavingDomain(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/domain`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save that domain.");
      toast.success("Domain saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSavingDomain(false);
    }
  }

  // --- Shared skip/lock/finish machinery ---
  const skipped = new Set(subAccount.setupSkippedSteps ?? []);
  const [skipping, setSkipping] = useState<StepId | null>(null);

  const doneMap: Record<StepId, boolean> = {
    identity: identityDone,
    communications: commsDone,
    listings: listingsDone,
    social: socialDone,
    domain: domainDone,
  };

  const states = deriveSetupStepStates(doneMap, subAccount.setupSkippedSteps ?? []);
  const stateFor = (id: StepId): SetupStepState => states[id];
  const isSatisfied = (id: StepId): boolean => states[id] === "done";

  async function skipStep(id: StepId) {
    setSkipping(id);
    try {
      const next = Array.from(new Set([...skipped, id]));
      await patchOnboarding(subAccountId, { skippedSteps: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not skip that step.");
    } finally {
      setSkipping(null);
    }
  }

  const allSatisfied = STEP_ORDER.every((id) => isSatisfied(id));
  const [finishing, setFinishing] = useState(false);

  async function finish() {
    setFinishing(true);
    try {
      await patchOnboarding(subAccountId, { wizardCompleted: true });
      router.replace(saPath("/dashboard"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not finish setup.");
      setFinishing(false);
    }
  }

  // Resume at the first step that isn't done, skipped, or locked — never
  // step 1 for a returning admin who already finished earlier steps.
  const firstOpenStep = STEP_ORDER.find((id) => states[id] === "active") ?? null;

  if (profileLoading) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Preparing your setup…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Set up {subAccount.name ?? "your workspace"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Five quick steps, in order — each one saves the moment you finish it.
          Steps stay visible even while locked, so you always know what
          unlocks them.
        </p>
      </div>

      <WelcomeVideoDialog
        subAccountId={subAccountId}
        enabled={!allSatisfied}
        onDone={() => {
          if (!firstOpenStep) return;
          const section = document.getElementById(`setup-step-${firstOpenStep}`);
          section?.scrollIntoView({ behavior: "smooth", block: "start" });
          section?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
        }}
      />

      <details className="bg-card rounded-2xl border p-5">
        <summary className="cursor-pointer text-sm font-medium">
          Rewatch Zack&apos;s 2-minute welcome tour
        </summary>
        <video
          src={WELCOME_VIDEO}
          controls
          playsInline
          preload="metadata"
          className="mt-3 w-full rounded-xl border bg-black"
        />
      </details>

      {/* 1. Identity */}
      <section id="setup-step-identity" className="bg-card rounded-2xl border p-5">
        <StepHeader
          step={1}
          title={STEP_TITLES.identity}
          description="Business name, license #, and service area — every step below builds on this."
          state={stateFor("identity")}
        />
        {stateFor("identity") === "done" ? (
          <p className="text-muted-foreground mt-3 text-sm">
            {profile?.brokerage} · License {profile?.licenseNumber} ·{" "}
            {profile?.serviceAreas}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="setup-brokerage">Business name</Label>
              <Input
                id="setup-brokerage"
                value={identityForm.brokerage}
                onChange={(e) =>
                  setIdentityForm((f) => ({ ...f, brokerage: e.target.value }))
                }
                placeholder="Your brokerage or business name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-license">License #</Label>
              <Input
                id="setup-license"
                value={identityForm.licenseNumber}
                onChange={(e) =>
                  setIdentityForm((f) => ({ ...f, licenseNumber: e.target.value }))
                }
                placeholder="Your real estate license number"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-service-area">Service area</Label>
              <Input
                id="setup-service-area"
                value={identityForm.serviceAreas}
                onChange={(e) =>
                  setIdentityForm((f) => ({ ...f, serviceAreas: e.target.value }))
                }
                placeholder="Towns or neighborhoods you serve"
              />
            </div>
            <Button
              size="sm"
              onClick={saveIdentity}
              disabled={
                savingIdentity ||
                !identityForm.brokerage.trim() ||
                !identityForm.licenseNumber.trim() ||
                !identityForm.serviceAreas.trim()
              }
            >
              {savingIdentity ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Continue
            </Button>
          </div>
        )}
      </section>

      {/* 2. Communications account */}
      <section id="setup-step-communications" className="bg-card rounded-2xl border p-5">
        <StepHeader
          step={2}
          title={STEP_TITLES.communications}
          description="How do your leads reach you today? Pick the account you already use."
          state={stateFor("communications")}
        />
        {stateFor("communications") === "locked" ? (
          <ul className="mt-3 space-y-1">
            <Requirement met={identityDone} label="Identity saved" />
          </ul>
        ) : stateFor("communications") === "done" ? (
          <p className="text-muted-foreground mt-3 text-sm">
            {subAccount.googleAccountConfig?.status === "connected"
              ? `Connected — ${subAccount.googleAccountConfig.email} (Google)`
              : subAccount.calendarConfig?.status === "connected"
                ? `Connected — ${subAccount.calendarConfig.email} (Outlook)`
                : `Connected — ${subAccount.twilioConfig?.fromNumber ?? "phone number"}`}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Button
              variant="outline"
              className="h-auto flex-col gap-1 py-4"
              render={<a href={googleAccountConnectPath(subAccountId)} />}
            >
              Google
              <span className="text-muted-foreground text-[11px] font-normal">
                Gmail + Calendar
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-1 py-4"
              onClick={connectOutlook}
              disabled={connectingOutlook}
            >
              {connectingOutlook ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Microsoft / Outlook"
              )}
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-1 py-4"
              onClick={() => setPhonePanelOpen((v) => !v)}
            >
              Phone number
              <span className="text-muted-foreground text-[11px] font-normal">
                Twilio
              </span>
            </Button>
            {phonePanelOpen ? (
              <div className="col-span-full mt-1 space-y-2 rounded-xl border p-3">
                <Input
                  value={smsForm.accountSid}
                  onChange={(e) =>
                    setSmsForm((f) => ({ ...f, accountSid: e.target.value }))
                  }
                  placeholder="Twilio Account SID (starts with AC)"
                />
                <Input
                  type="password"
                  value={smsForm.authToken}
                  onChange={(e) =>
                    setSmsForm((f) => ({ ...f, authToken: e.target.value }))
                  }
                  placeholder="Twilio Auth Token"
                />
                <Input
                  value={smsForm.fromNumber}
                  onChange={(e) =>
                    setSmsForm((f) => ({ ...f, fromNumber: e.target.value }))
                  }
                  placeholder="+15551234567"
                />
                <Button
                  size="sm"
                  onClick={saveSms}
                  disabled={
                    savingSms ||
                    !smsForm.accountSid.trim() ||
                    !smsForm.authToken.trim() ||
                    !smsForm.fromNumber.trim()
                  }
                >
                  {savingSms ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Connect number
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* 3. Listings source */}
      <section id="setup-step-listings" className="bg-card rounded-2xl border p-5">
        <StepHeader
          step={3}
          title={STEP_TITLES.listings}
          description="Connect your IDX Broker key and pick an approved MLS feed."
          state={stateFor("listings")}
        />
        {stateFor("listings") === "locked" ? (
          <ul className="mt-3 space-y-1">
            <Requirement met={commsDone} label="Communications account connected" />
          </ul>
        ) : stateFor("listings") === "done" ? (
          <p className="text-muted-foreground mt-3 text-sm">
            Connected{subAccount.idxConfig?.mlsId ? ` — MLS ${subAccount.idxConfig.mlsId}` : ""}.
          </p>
        ) : !listingsGateOn ? (
          <div className="mt-3 space-y-2">
            <p className="text-muted-foreground text-sm">
              Listings isn&apos;t turned on for this workspace yet. Skip for now — you
              can connect it later from Settings.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void skipStep("listings")}
              disabled={skipping === "listings"}
            >
              <SkipForward className="mr-1.5 h-3.5 w-3.5" />
              Skip for now
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="setup-idx-key">IDX Broker access key</Label>
              <Input
                id="setup-idx-key"
                value={idxForm.accessKey}
                onChange={(e) =>
                  setIdxForm((f) => ({ ...f, accessKey: e.target.value }))
                }
                placeholder="From IDX Broker → Account → API Access"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup-mls">MLS id (optional)</Label>
              <Input
                id="setup-mls"
                value={idxForm.mlsId}
                onChange={(e) => setIdxForm((f) => ({ ...f, mlsId: e.target.value }))}
                placeholder="Leave blank if your account has only one"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={saveIdx}
                disabled={savingIdx || !idxForm.accessKey.trim()}
              >
                {savingIdx ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Connect
              </Button>
              {listingsDone ? (
                <Button size="sm" variant="outline" onClick={testSync} disabled={syncing}>
                  {syncing ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Test sync
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void skipStep("listings")}
                disabled={skipping === "listings"}
              >
                Skip for now
              </Button>
            </div>
            {syncMessage ? (
              <p className="text-muted-foreground text-xs">{syncMessage}</p>
            ) : null}
          </div>
        )}
      </section>

      {/* 4. Social */}
      <section id="setup-step-social" className="bg-card rounded-2xl border p-5">
        <StepHeader
          step={4}
          title={STEP_TITLES.social}
          description="One Facebook & Instagram connection unlocks the unified inbox and the Social Planner together."
          state={stateFor("social")}
        />
        {stateFor("social") === "locked" ? (
          <ul className="mt-3 space-y-1">
            <Requirement met={commsDone} label="Communications account connected" />
          </ul>
        ) : stateFor("social") === "done" ? (
          <p className="text-muted-foreground mt-3 text-sm">
            Connected — {subAccount.metaConfig?.pageName ?? "Facebook & Instagram"}.
          </p>
        ) : !socialGateOn ? (
          <div className="mt-3 space-y-2">
            <p className="text-muted-foreground text-sm">
              Social isn&apos;t turned on for this workspace yet. Skip for now — you
              can connect it later from Settings.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void skipStep("social")}
              disabled={skipping === "social"}
            >
              <SkipForward className="mr-1.5 h-3.5 w-3.5" />
              Skip for now
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2">
            <Button
              size="sm"
              render={<a href={`/api/sub-accounts/${subAccountId}/meta/connect`} />}
            >
              Connect Facebook & Instagram
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void skipStep("social")}
              disabled={skipping === "social"}
            >
              Skip for now
            </Button>
          </div>
        )}
      </section>

      {/* 5. Domain */}
      <section id="setup-step-domain" className="bg-card rounded-2xl border p-5">
        <StepHeader
          step={5}
          title={STEP_TITLES.domain}
          description="Optional, and only after the steps above — a domain with no content behind it is a dead link."
          state={stateFor("domain")}
        />
        {stateFor("domain") === "locked" ? (
          <ul className="mt-3 space-y-1">
            <Requirement met={isSatisfied("listings")} label="Listings source connected or skipped" />
            <Requirement met={isSatisfied("social")} label="Social connected or skipped" />
          </ul>
        ) : stateFor("domain") === "done" ? (
          <p className="text-muted-foreground mt-3 text-sm">
            Connected — {subAccount.customDomain}.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="setup-domain">Domain</Label>
              <Input
                id="setup-domain"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="example.com"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={saveDomain}
                disabled={savingDomain || !domainInput.trim()}
              >
                {savingDomain ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Connect
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void skipStep("domain")}
                disabled={skipping === "domain"}
              >
                Skip for now
              </Button>
            </div>
          </div>
        )}
      </section>

      {allSatisfied ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
          <h2 className="text-lg font-semibold">You&apos;re set up</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Every step above is connected or intentionally skipped. You can revisit
            any of them later from Connect or Settings.
          </p>
          <Button className="mt-4" onClick={finish} disabled={finishing}>
            {finishing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Go to my dashboard
          </Button>
        </section>
      ) : firstOpenStep ? (
        <p className="text-muted-foreground text-center text-xs">
          Next up: {STEP_TITLES[firstOpenStep]}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { ArrowRight, Loader2, PhoneOff, PhoneOutgoing } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { formatRelativeTime, toDate } from "@/lib/format";
import type { AiAgentProfile, AiChannelConfig, VoiceChannelConfig } from "@/types/ai";
import { DEFAULT_VOICE_CONFIG } from "@/types/ai";
import type { VoiceCampaignDoc } from "@/types";

/** Hard-stop window for a test call (mirrors the server-side cap). */
const TEST_DURATION_S = 60;

/**
 * Outbound Voice tab. Distinct from the inbound Voice tab: it owns the
 * outbound persona (a separate system prompt — outbound is a proactive
 * conversation), the outbound opener, the compliance settings (calling
 * window + caps + country allow-list), and a list of recent campaigns.
 *
 * Outbound reuses the SAME Vapi assistant + number provisioned by the
 * inbound Voice channel, so it surfaces a "enable Voice first" notice
 * until that's done. Gated by the agency-level `outboundVoiceEnabledByAgency`.
 */
export function OutboundVoiceSection() {
  const { subAccountId, subAccount, isAdmin, saPath } = useSubAccount();

  const [config, setConfig] = useState<AiChannelConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [persona, setPersona] = useState("");
  const [opener, setOpener] = useState(DEFAULT_VOICE_CONFIG.outboundFirstMessage);
  const [startHour, setStartHour] = useState(
    DEFAULT_VOICE_CONFIG.outboundWindow?.startHour ?? 9,
  );
  const [endHour, setEndHour] = useState(
    DEFAULT_VOICE_CONFIG.outboundWindow?.endHour ?? 18,
  );
  const [timezone, setTimezone] = useState(
    DEFAULT_VOICE_CONFIG.outboundWindow?.timezone ?? "Australia/Sydney",
  );
  const [perMinute, setPerMinute] = useState(
    DEFAULT_VOICE_CONFIG.outboundPerMinuteCap,
  );
  const [daily, setDaily] = useState(DEFAULT_VOICE_CONFIG.outboundDailyCap);
  const [perNumber, setPerNumber] = useState(
    DEFAULT_VOICE_CONFIG.outboundPerNumberPerDay,
  );
  const [countries, setCountries] = useState("");

  const [saving, setSaving] = useState(false);
  const [campaigns, setCampaigns] = useState<VoiceCampaignDoc[]>([]);

  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [ending, setEnding] = useState(false);
  // Vapi per-call control URL — lets us end the test call early.
  const [testControlUrl, setTestControlUrl] = useState<string | null>(null);
  // 0..1 progress of the 20s test-call window (null = idle). Client-side
  // visual matching the hard-stop on the test call — not live call state.
  const [testProgress, setTestProgress] = useState<number | null>(null);
  const testTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopTestProgress() {
    if (testTimerRef.current) {
      clearInterval(testTimerRef.current);
      testTimerRef.current = null;
    }
    setTestProgress(null);
  }

  useEffect(
    () => () => {
      if (testTimerRef.current) clearInterval(testTimerRef.current);
    },
    [],
  );

  function startTestProgress() {
    if (testTimerRef.current) clearInterval(testTimerRef.current);
    const start = Date.now();
    setTestProgress(0);
    testTimerRef.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / 1000 / TEST_DURATION_S);
      setTestProgress(p);
      if (p >= 1 && testTimerRef.current) {
        clearInterval(testTimerRef.current);
        testTimerRef.current = null;
        setTimeout(() => setTestProgress(null), 1200);
      }
    }, 200);
  }

  const hydrate = useCallback(async () => {
    setLoaded(false);
    try {
      const [profileRes, channelRes] = await Promise.all([
        fetch(`/api/sub-accounts/${subAccountId}/ai-agent/profile`),
        fetch(`/api/sub-accounts/${subAccountId}/ai-agent/channels/voice`),
      ]);
      const profileData = (await profileRes.json()) as {
        profile: AiAgentProfile | null;
      };
      const channelData = (await channelRes.json()) as {
        config: AiChannelConfig | null;
      };
      setConfig(channelData.config);

      const v: VoiceChannelConfig =
        channelData.config?.voice ?? DEFAULT_VOICE_CONFIG;
      setEnabled(v.outboundEnabled ?? false);
      setPersona(v.outboundSystemPrompt ?? "");
      setOpener(v.outboundFirstMessage ?? DEFAULT_VOICE_CONFIG.outboundFirstMessage);
      setStartHour(v.outboundWindow?.startHour ?? 9);
      setEndHour(v.outboundWindow?.endHour ?? 18);
      setTimezone(
        v.outboundWindow?.timezone ??
          profileData.profile?.timezone ??
          "Australia/Sydney",
      );
      setPerMinute(v.outboundPerMinuteCap ?? DEFAULT_VOICE_CONFIG.outboundPerMinuteCap);
      setDaily(v.outboundDailyCap ?? DEFAULT_VOICE_CONFIG.outboundDailyCap);
      setPerNumber(
        v.outboundPerNumberPerDay ?? DEFAULT_VOICE_CONFIG.outboundPerNumberPerDay,
      );
      setCountries((v.allowedCountries ?? []).join(", "));
    } catch (err) {
      toast.error(
        `Couldn't load outbound config: ${err instanceof Error ? err.message : "error"}`,
      );
    } finally {
      setLoaded(true);
    }
  }, [subAccountId]);

  useEffect(() => {
    if (!isAdmin) return;
    void hydrate();
  }, [isAdmin, hydrate]);

  // Recent campaigns for this sub-account.
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(
      collection(getFirebaseDb(), "voiceCampaigns"),
      where("subAccountId", "==", subAccountId),
    );
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as VoiceCampaignDoc);
      list.sort(
        (a, b) =>
          (toDate(b.createdAt)?.getTime() ?? 0) -
          (toDate(a.createdAt)?.getTime() ?? 0),
      );
      setCampaigns(list.slice(0, 5));
    });
  }, [isAdmin, subAccountId]);

  if (!isAdmin) return null;

  const gateOn = subAccount?.outboundVoiceEnabledByAgency === true;
  const provisioned = !!(
    config?.voice?.vapiAssistantId && config?.voice?.vapiPhoneNumberId
  );

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ai-agent/channels/voice`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Only outbound fields — the channel route merges these into
            // the existing voice block, leaving inbound settings untouched.
            voice: {
              outboundEnabled: enabled,
              outboundSystemPrompt: persona,
              outboundFirstMessage:
                opener.trim() || DEFAULT_VOICE_CONFIG.outboundFirstMessage,
              outboundWindow: {
                startHour,
                endHour,
                timezone:
                  timezone.trim() ||
                  DEFAULT_VOICE_CONFIG.outboundWindow?.timezone ||
                  "Australia/Sydney",
              },
              outboundPerMinuteCap: perMinute,
              outboundDailyCap: daily,
              outboundPerNumberPerDay: perNumber,
              allowedCountries: countries.trim()
                ? countries
                    .split(",")
                    .map((s) => s.trim().toUpperCase())
                    .filter((s) => /^[A-Z]{2}$/.test(s))
                : null,
            },
          }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        config?: AiChannelConfig;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save");
        return;
      }
      if (data.config) setConfig(data.config);
      toast.success("Outbound settings saved");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    if (testing) return;
    if (!testPhone.trim()) {
      toast.error("Enter a number to call.");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/comms/voice/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subAccountId, phone: testPhone.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't place the test call.");
        return;
      }
      toast.success(`Calling ${testPhone.trim()} now — pick up to hear it.`);
      setTestControlUrl(
        typeof (data as { controlUrl?: string }).controlUrl === "string"
          ? (data as { controlUrl?: string }).controlUrl ?? null
          : null,
      );
      startTestProgress();
    } catch {
      toast.error("Network error — try again");
    } finally {
      setTesting(false);
    }
  }

  async function endTest() {
    if (ending) return;
    // No control URL (older call / Vapi didn't return one) → just clear the
    // UI; the 20s hard stop ends it regardless.
    if (!testControlUrl) {
      stopTestProgress();
      return;
    }
    setEnding(true);
    try {
      const res = await fetch("/api/comms/voice/test-call/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlUrl: testControlUrl }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't end the call — it'll stop at 20s.");
        return;
      }
      toast.success("Call ended.");
      stopTestProgress();
      setTestControlUrl(null);
    } catch {
      toast.error("Network error — the call will stop at 20s.");
    } finally {
      setEnding(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
          <PhoneOutgoing className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Outbound Voice
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The AI calls your contacts — one at a time from a contact profile,
            or a whole list via a campaign. It uses its own outbound persona,
            not the shared inbound one.
          </p>
        </div>
      </header>

      {!gateOn ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-800 dark:text-amber-400">
          <strong>Locked by your agency.</strong> Outbound calling consumes
          call minutes and carries compliance weight, so the agency owner
          enables it per workspace (Agency → Sub-accounts → Manage). Once it&apos;s
          on, this page unlocks.
        </div>
      ) : (
        <>
          {!provisioned && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-400">
              <strong>Set up the Voice channel first.</strong> Outbound reuses
              the same number as inbound — enable it once on the{" "}
              <Link
                href={saPath("/ai-agents/voice")}
                className="underline-offset-2 hover:underline"
              >
                Voice tab
              </Link>{" "}
              so the calling number is provisioned.
            </div>
          )}

          {!loaded ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <form className="space-y-5" onSubmit={handleSave}>
              <label className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div>
                  <p className="text-sm font-medium">Enable outbound calling</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Turns on the &quot;Call with AI&quot; button on contacts and
                    the &quot;Bulk AI call&quot; campaign action.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
              </label>

              <div className="space-y-1.5">
                <Label htmlFor="ob-persona">Outbound persona / system prompt</Label>
                <Textarea
                  id="ob-persona"
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  rows={6}
                  placeholder={
                    "You're calling contacts about a specific offer. State who you are and why you're calling, gauge interest, and if they're keen say a human will follow up. Keep replies to 1–2 sentences. Don't take payment on the call."
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Used only on outbound calls — separate from the shared inbound
                  persona on the Overview tab. Leave blank to fall back to the
                  shared persona (not recommended for outbound). Business hours,
                  KB and contact context still apply.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ob-opener">Outbound opener</Label>
                <Input
                  id="ob-opener"
                  value={opener}
                  onChange={(e) => setOpener(e.target.value)}
                  placeholder={DEFAULT_VOICE_CONFIG.outboundFirstMessage}
                  maxLength={400}
                />
                <p className="text-[11px] text-muted-foreground">
                  The first line the agent speaks when the contact answers.
                </p>
              </div>

              <fieldset className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <legend className="px-1 text-sm font-medium">
                  Compliance &amp; pacing
                </legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-start">Window start (h)</Label>
                    <Input
                      id="ob-start"
                      type="number"
                      min={0}
                      max={23}
                      value={startHour}
                      onChange={(e) => setStartHour(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-end">Window end (h)</Label>
                    <Input
                      id="ob-end"
                      type="number"
                      min={1}
                      max={24}
                      value={endHour}
                      onChange={(e) => setEndHour(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-tz">Fallback timezone</Label>
                    <TimezoneSelect
                      id="ob-tz"
                      value={timezone}
                      onChange={setTimezone}
                      className="flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_option]:bg-background [&_option]:text-foreground"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Evaluated in the contact&apos;s local time (from their phone
                  country); the fallback zone is used when it can&apos;t be
                  determined.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-permin">Calls / min</Label>
                    <Input
                      id="ob-permin"
                      type="number"
                      min={1}
                      max={60}
                      value={perMinute}
                      onChange={(e) => setPerMinute(Number(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-daily">Calls / day</Label>
                    <Input
                      id="ob-daily"
                      type="number"
                      min={1}
                      max={5000}
                      value={daily}
                      onChange={(e) => setDaily(Number(e.target.value) || 1)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-pernum">Per number / day</Label>
                    <Input
                      id="ob-pernum"
                      type="number"
                      min={1}
                      max={20}
                      value={perNumber}
                      onChange={(e) => setPerNumber(Number(e.target.value) || 1)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ob-countries">Allowed countries (optional)</Label>
                  <Input
                    id="ob-countries"
                    value={countries}
                    onChange={(e) => setCountries(e.target.value)}
                    placeholder="AU, NZ, US — blank = allow all"
                    maxLength={200}
                  />
                </div>
              </fieldset>

              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save outbound settings"
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Test call */}
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Test this setup</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Call your own number now to hear the saved opener + persona.
              Bypasses the compliance gate (it&apos;s a test) and leaves no
              trace. <strong>Save your settings first</strong> so the test
              reflects the latest persona.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+1 555 123 4567 — a number you can answer"
                className="sm:flex-1"
                disabled={!provisioned}
              />
              {testProgress !== null ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={endTest}
                  disabled={ending}
                >
                  {ending ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      Ending…
                    </>
                  ) : (
                    <>
                      <PhoneOff className="mr-1 h-4 w-4" />
                      End call
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={runTest}
                  disabled={testing || !provisioned || !testPhone.trim()}
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      Calling…
                    </>
                  ) : (
                    <>
                      <PhoneOutgoing className="mr-1 h-4 w-4" />
                      Place test call
                    </>
                  )}
                </Button>
              )}
            </div>

            {testProgress !== null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Test call in progress (hard stop at {TEST_DURATION_S}s)</span>
                  <span className="tabular-nums">
                    {Math.ceil(TEST_DURATION_S * (1 - testProgress))}s left
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-orange-500 transition-[width] duration-200 ease-linear"
                    style={{ width: `${testProgress * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Campaigns */}
          <div className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Recent campaigns</h2>
              <Link
                href={saPath("/contacts")}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Start a bulk campaign
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {campaigns.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No campaigns yet. From{" "}
                <Link
                  href={saPath("/contacts")}
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  Contacts
                </Link>
                , pick an audience and hit <strong>Bulk AI call</strong>.
              </p>
            ) : (
              <ul className="divide-y">
                {campaigns.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={saPath(`/ai-agents/outbound/campaigns/${c.id}`)}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-accent/40"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {c.code && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {c.code}
                            </span>
                          )}
                          <span className="truncate capitalize">
                            {c.name || c.status}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(c.createdAt)}
                          {typeof c.totals.interested === "number" &&
                            c.totals.interested > 0 && (
                              <span className="ml-2 font-medium text-violet-600 dark:text-violet-400">
                                · {c.totals.interested} interested
                              </span>
                            )}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {c.totals.called}
                          </span>{" "}
                          called
                        </span>
                        <span>/ {c.totals.audienceSize} total</span>
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

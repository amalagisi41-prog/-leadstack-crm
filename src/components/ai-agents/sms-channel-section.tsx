"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiAgentProfile, AiChannelConfig } from "@/types/ai";

/**
 * SMS-specific operational settings. The persona itself lives on the
 * Agent Profile (Overview); this page only configures channel-level
 * concerns: enabled toggle, model, escalation overrides, context size.
 */
export function SmsChannelSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();

  const [profile, setProfile] = useState<AiAgentProfile | null>(null);
  const [config, setConfig] = useState<AiChannelConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [contextCount, setContextCount] = useState(10);
  const [modelOverride, setModelOverride] = useState("");
  const [overrideKeywords, setOverrideKeywords] = useState(false);
  const [keywordsText, setKeywordsText] = useState("");
  const [overrideEmail, setOverrideEmail] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");

  const [saving, setSaving] = useState(false);

  const hydrate = useCallback(async () => {
    setLoaded(false);
    try {
      const [profileRes, channelRes] = await Promise.all([
        fetch(`/api/sub-accounts/${subAccountId}/ai-agent/profile`),
        fetch(`/api/sub-accounts/${subAccountId}/ai-agent/channels/sms`),
      ]);
      const profileData = (await profileRes.json()) as {
        profile: AiAgentProfile | null;
      };
      const channelData = (await channelRes.json()) as {
        config: AiChannelConfig | null;
      };
      setProfile(profileData.profile);
      setConfig(channelData.config);

      if (channelData.config) {
        setEnabled(channelData.config.enabled);
        setContextCount(channelData.config.contextMessageCount);
        setModelOverride(channelData.config.modelOverride ?? "");
        setOverrideKeywords(channelData.config.escalationKeywordsOverride !== null);
        setKeywordsText(
          (channelData.config.escalationKeywordsOverride ?? []).join(", "),
        );
        setOverrideEmail(
          channelData.config.escalationNotifyEmailOverride !== null,
        );
        setNotifyEmail(channelData.config.escalationNotifyEmailOverride ?? "");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Couldn't load SMS config: ${msg}`);
    } finally {
      setLoaded(true);
    }
  }, [subAccountId]);

  useEffect(() => {
    if (!isAdmin) return;
    void hydrate();
  }, [isAdmin, hydrate]);

  const totalTokens = useMemo(
    () => config?.totalTokensUsed ?? 0,
    [config?.totalTokensUsed],
  );

  if (!isAdmin) return null;

  const dedicatedSmsConfigured = !!subAccount?.twilioConfig?.enabled;
  const profileReady = !!profile?.systemPrompt?.trim();

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const keywords = overrideKeywords
        ? keywordsText
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : null;

      const email = overrideEmail ? notifyEmail.trim() || null : null;

      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ai-agent/channels/sms`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled,
            contextMessageCount: contextCount,
            modelOverride: modelOverride.trim() || null,
            escalationKeywordsOverride: overrideKeywords ? keywords : null,
            escalationNotifyEmailOverride: overrideEmail ? email : null,
          }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        config?: AiChannelConfig;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save SMS settings");
        return;
      }
      if (data.config) setConfig(data.config);
      toast.success("SMS channel saved");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <MessageSquare className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">SMS channel</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Operational settings for the SMS agent. Persona, hours, and
            default escalation live on the{" "}
            <Link
              href={`/sa/${subAccountId}/ai-agents`}
              className="text-foreground underline-offset-2 hover:underline"
            >
              Overview
            </Link>
            .
          </p>
        </div>
      </div>

      {!dedicatedSmsConfigured && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-400">
          <strong>Heads up:</strong> SMS agent requires a dedicated Twilio
          number on this sub-account. Enable one in Settings → SMS first.
        </div>
      )}

      {!profileReady && loaded && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-400">
          <strong>Set the agent persona first.</strong> The SMS toggle will
          be rejected until you save a persona prompt on the{" "}
          <Link
            href={`/sa/${subAccountId}/ai-agents`}
            className="underline-offset-2 hover:underline"
          >
            Overview
          </Link>
          .
        </div>
      )}

      {!loaded ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form className="mt-6 space-y-5" onSubmit={handleSave}>
          <label className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Enable SMS auto-replies</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                When on, inbound SMS to this sub-account&apos;s number gets
                an AI response in real time.
              </p>
            </div>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 cursor-pointer"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sms-context-count">Context messages (1-50)</Label>
              <Input
                id="sms-context-count"
                type="number"
                min={1}
                max={50}
                value={contextCount}
                onChange={(e) =>
                  setContextCount(Number(e.target.value) || 10)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sms-model">Model (advanced — blank for default)</Label>
              <Input
                id="sms-model"
                value={modelOverride}
                onChange={(e) => setModelOverride(e.target.value)}
                placeholder="anthropic/claude-haiku-4-5"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Default model: Claude Haiku 4.5. Override with{" "}
            <code>anthropic/claude-opus-4-7</code> for premium quality at
            ~50× the cost. Any OpenRouter model id works.
          </p>

          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={overrideKeywords}
                onChange={(e) => setOverrideKeywords(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Override default escalation keywords for SMS
            </label>
            {overrideKeywords ? (
              <Input
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="manager, human, complaint, stop ai"
              />
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Using profile defaults:{" "}
                <code className="text-foreground">
                  {profile?.escalationKeywords.join(", ") || "(none set)"}
                </code>
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={overrideEmail}
                onChange={(e) => setOverrideEmail(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Override escalation notification email for SMS
            </label>
            {overrideEmail ? (
              <Input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="sms-escalations@example.com"
              />
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Using profile default:{" "}
                <code className="text-foreground">
                  {profile?.escalationNotifyEmail || "(none set)"}
                </code>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Lifetime tokens used on SMS:{" "}
              <span className="font-medium text-foreground">
                {totalTokens.toLocaleString()}
              </span>
            </p>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save SMS settings"
              )}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

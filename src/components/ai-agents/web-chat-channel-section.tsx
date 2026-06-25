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
import {
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
  MessageCircle,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AiAgentProfile, AiChannelConfig } from "@/types/ai";

/**
 * Web Chat channel settings. Operator configures:
 *   - enabled toggle
 *   - welcome message + accent color + position (theme)
 *   - allowed domains (origin allowlist)
 *   - model override + context messages + escalation overrides
 *
 * Then copies the snippet and pastes it into their client's website's
 * <head> or right before </body>.
 */
export function WebChatChannelSection() {
  const { subAccountId, isAdmin } = useSubAccount();

  const [profile, setProfile] = useState<AiAgentProfile | null>(null);
  const [config, setConfig] = useState<AiChannelConfig | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState("Hi! How can I help?");
  const [accentColor, setAccentColor] = useState("#7c3aed");
  const [position, setPosition] = useState<"right" | "left">("right");
  const [allowedDomainsText, setAllowedDomainsText] = useState("");

  const [contextCount, setContextCount] = useState(10);
  const [modelOverride, setModelOverride] = useState("");
  const [overrideKeywords, setOverrideKeywords] = useState(false);
  const [keywordsText, setKeywordsText] = useState("");
  const [overrideEmail, setOverrideEmail] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const hydrate = useCallback(async () => {
    setLoaded(false);
    try {
      const [profileRes, channelRes] = await Promise.all([
        fetch(`/api/sub-accounts/${subAccountId}/ai-agent/profile`),
        fetch(`/api/sub-accounts/${subAccountId}/ai-agent/channels/web-chat`),
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
        setOverrideKeywords(
          channelData.config.escalationKeywordsOverride !== null,
        );
        setKeywordsText(
          (channelData.config.escalationKeywordsOverride ?? []).join(", "),
        );
        setOverrideEmail(
          channelData.config.escalationNotifyEmailOverride !== null,
        );
        setNotifyEmail(channelData.config.escalationNotifyEmailOverride ?? "");

        const wc = channelData.config.webChat;
        if (wc) {
          setWelcomeMessage(wc.welcomeMessage);
          setAccentColor(wc.accentColor);
          setPosition(wc.position);
          setAllowedDomainsText(wc.allowedDomains.join("\n"));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Couldn't load Web Chat config: ${msg}`);
    } finally {
      setLoaded(true);
    }
  }, [subAccountId]);

  useEffect(() => {
    if (!isAdmin) return;
    void hydrate();
  }, [isAdmin, hydrate]);

  const personaConfigured = !!profile?.systemPrompt?.trim();

  const snippet = useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://leadstack.dev";
    return `<script src="${origin}/widget.js" data-sa="${subAccountId}" async></script>`;
  }, [subAccountId]);

  const previewUrl = useMemo(() => {
    if (typeof window === "undefined") return "#";
    return `${window.location.origin}/embed/chat/${subAccountId}`;
  }, [subAccountId]);

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Snippet copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — try selecting + copying manually");
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const allowedDomains = allowedDomainsText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const body: Record<string, unknown> = {
        enabled,
        contextMessageCount: contextCount,
        modelOverride: modelOverride.trim() || null,
        escalationKeywordsOverride: overrideKeywords
          ? keywordsText
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          : null,
        escalationNotifyEmailOverride: overrideEmail
          ? notifyEmail.trim() || null
          : null,
        webChat: {
          welcomeMessage,
          accentColor,
          position,
          allowedDomains,
        },
      };

      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ai-agent/channels/web-chat`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        config?: AiChannelConfig;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save Web Chat settings");
        return;
      }
      if (data.config) setConfig(data.config);
      toast.success("Web Chat settings saved");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) {
    return (
      <section className="rounded-2xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Admin access required to configure Web Chat.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Web Chat channel</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Embed a chat widget on this client&rsquo;s website. The agent
              answers using the shared persona + KB from the{" "}
              <Link
                href={`/sa/${subAccountId}/ai-agents`}
                className="underline-offset-2 hover:underline"
              >
                Overview
              </Link>
              .
            </p>
          </div>
        </div>
        <Link
          href={`/sa/${subAccountId}/ai-agents/web-chat/sessions`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
        >
          <Inbox className="h-3.5 w-3.5" />
          Sessions
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Gate on `loaded` so the warning doesn't flash on first paint
          while the profile fetch is in flight. Pre-load, `profile` is
          null which makes `personaConfigured` false even when a persona
          is actually saved server-side. */}
      {loaded && !personaConfigured && (
        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-400">
          <strong>Set the agent persona first.</strong> The Web Chat toggle
          will be rejected until you save a persona prompt on the{" "}
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
          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Checkbox
              id="wc-enabled"
              checked={enabled}
              onCheckedChange={(v) => setEnabled(!!v)}
            />
            <div className="flex-1">
              <Label htmlFor="wc-enabled" className="text-sm font-medium">
                Enable Web Chat
              </Label>
              <p className="mt-1 text-[12px] text-muted-foreground">
                When on, the snippet below will render the chat widget on
                any page where it&rsquo;s pasted (as long as the page&rsquo;s
                domain is in the allowlist below).
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wc-welcome">Welcome message</Label>
            <Textarea
              id="wc-welcome"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="Hi! How can I help?"
            />
            <p className="text-[11px] text-muted-foreground">
              First message shown when the visitor opens the widget.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wc-accent">Accent color</Label>
              <div className="flex gap-2">
                <input
                  id="wc-accent"
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded-lg border border-input bg-transparent"
                  aria-label="Pick accent color"
                />
                <Input
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="#7c3aed"
                  className="flex-1 font-mono text-xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wc-position">Bubble position</Label>
              <select
                id="wc-position"
                value={position}
                onChange={(e) =>
                  setPosition(e.target.value === "left" ? "left" : "right")
                }
                className="flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_option]:bg-background [&_option]:text-foreground"
              >
                <option value="right">Bottom-right</option>
                <option value="left">Bottom-left</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wc-domains">Allowed domains</Label>
            <Textarea
              id="wc-domains"
              value={allowedDomainsText}
              onChange={(e) => setAllowedDomainsText(e.target.value)}
              rows={3}
              placeholder={"client-site.com\nwww.client-site.com"}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              One hostname per line, no protocol. Only these origins can load
              the widget. Leave empty during testing to allow{" "}
              <code>localhost</code> + your LeadStack domain.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wc-context">Context messages (1-50)</Label>
              <Input
                id="wc-context"
                type="number"
                min={1}
                max={50}
                value={contextCount}
                onChange={(e) => setContextCount(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wc-model">Model (advanced — blank for default)</Label>
              <Input
                id="wc-model"
                value={modelOverride}
                onChange={(e) => setModelOverride(e.target.value)}
                placeholder="anthropic/claude-haiku-4-5"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="wc-override-keywords"
                checked={overrideKeywords}
                onCheckedChange={(v) => setOverrideKeywords(!!v)}
              />
              <div className="flex-1">
                <Label htmlFor="wc-override-keywords" className="text-sm">
                  Override default escalation keywords for Web Chat
                </Label>
                {!overrideKeywords && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Using profile defaults:{" "}
                    <code className="text-foreground">
                      {(profile?.escalationKeywords ?? []).join(", ") ||
                        "(none set)"}
                    </code>
                  </p>
                )}
              </div>
            </div>
            {overrideKeywords && (
              <Input
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                placeholder="manager, human, refund"
              />
            )}
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="wc-override-email"
                checked={overrideEmail}
                onCheckedChange={(v) => setOverrideEmail(!!v)}
              />
              <div className="flex-1">
                <Label htmlFor="wc-override-email" className="text-sm">
                  Override escalation notification email for Web Chat
                </Label>
                {!overrideEmail && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Using profile default:{" "}
                    <code className="text-foreground">
                      {profile?.escalationNotifyEmail || "(none set)"}
                    </code>
                  </p>
                )}
              </div>
            </div>
            {overrideEmail && (
              <Input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="ops@example.com"
              />
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Lifetime tokens used on Web Chat:{" "}
              <span className="font-medium text-foreground">
                {config?.totalTokensUsed ?? 0}
              </span>
            </p>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Web Chat settings"
              )}
            </Button>
          </div>
        </form>
      )}

      {loaded && (
        <div className="mt-6 space-y-3 rounded-xl border bg-muted/20 p-4">
          <div>
            <h3 className="text-sm font-medium">Embed snippet</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste this once into the client&rsquo;s site, just before{" "}
              <code>&lt;/body&gt;</code>. Works on any framework — static
              HTML, WordPress, Shopify, Webflow, GitLab Pages, anything.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-lg border bg-background p-3 text-xs">
            {snippet}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copySnippet}
              disabled={!enabled}
              title={!enabled ? "Enable + save Web Chat first" : "Copy snippet"}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy snippet"}
            </Button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Preview widget
            </a>
          </div>
          {!enabled && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              Enable + save before installing — the snippet will silently
              do nothing until the channel is on.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

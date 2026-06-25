"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import { Eye, Loader2, RefreshCcw, Sparkles, User } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { formatRelativeTime } from "@/lib/format";
import type { AiAgentProfile } from "@/types/ai";

const HOURS_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

// Shared Tailwind className for the hour <select>s. Native option lists
// inherit the parent select's background — using `bg-transparent` makes
// the popup unreadable in dark themes (greyish text on whatever shows
// through). We set explicit bg + text on the select AND on nested
// `option` so the dropdown popup is high-contrast everywhere.
const NATIVE_SELECT_CLASSES =
  "flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_option]:bg-background [&_option]:text-foreground";

const DEFAULT_PROMPT_PLACEHOLDER = `You are a friendly receptionist for {{businessName}}. Help leads with quick questions about services and hours. If they want a quote, capture their name + best time to call and confirm someone will reach out. Stay short and warm — you're texting, not writing essays.`;

/**
 * Agent Profile editor — the shared identity used by every active channel.
 * Lives on the AI Agents → Overview page. Channels inherit this and only
 * override operational settings (enabled toggle, model, etc.).
 */
export function AgentProfileSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();

  const [profile, setProfile] = useState<AiAgentProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [systemPrompt, setSystemPrompt] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [hoursStart, setHoursStart] = useState(9);
  const [hoursEnd, setHoursEnd] = useState(17);
  const [timezone, setTimezone] = useState("Australia/Sydney");
  const [keywordsText, setKeywordsText] = useState(
    "manager, human, complaint, stop ai",
  );
  const [notifyEmail, setNotifyEmail] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [refreshingKb, setRefreshingKb] = useState(false);
  const [kbModalOpen, setKbModalOpen] = useState(false);

  // Test panel
  const [testMessage, setTestMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [testReply, setTestReply] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const hydrate = useCallback(async () => {
    setLoaded(false);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ai-agent/profile`,
      );
      if (!res.ok) throw new Error("Failed to load agent profile");
      const data = (await res.json()) as { profile: AiAgentProfile | null };
      setProfile(data.profile);
      if (data.profile) {
        // Saved profile exists — hydrate from server. Backfill the
        // suggestion if the saved prompt is somehow empty (e.g. legacy
        // doc) so the operator never sees a totally blank textarea.
        setSystemPrompt(
          data.profile.systemPrompt?.trim()
            ? data.profile.systemPrompt
            : DEFAULT_PROMPT_PLACEHOLDER,
        );
        setBusinessName(data.profile.businessName || subAccount?.name || "");
        setHoursStart(data.profile.hoursStart);
        setHoursEnd(data.profile.hoursEnd);
        setTimezone(data.profile.timezone);
        setKeywordsText(data.profile.escalationKeywords.join(", "));
        setNotifyEmail(data.profile.escalationNotifyEmail ?? "");
        setWebsiteUrl(data.profile.websiteUrl ?? "");
      } else {
        // First-time setup — pre-fill the suggested persona as real
        // content (not just a placeholder) so the operator can save it
        // as-is or tweak it. Previously this was just a placeholder,
        // which looked like saved content but actually wasn't.
        setSystemPrompt(DEFAULT_PROMPT_PLACEHOLDER);
        setBusinessName(subAccount?.name ?? "");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Couldn't load profile: ${msg}`);
    } finally {
      setLoaded(true);
    }
  }, [subAccountId, subAccount?.name]);

  useEffect(() => {
    if (!isAdmin) return;
    void hydrate();
  }, [isAdmin, hydrate]);

  if (!isAdmin) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const keywords = keywordsText
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ai-agent/profile`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemPrompt,
            businessName,
            hoursStart,
            hoursEnd,
            timezone,
            escalationKeywords: keywords,
            escalationNotifyEmail: notifyEmail.trim() || null,
            websiteUrl: websiteUrl.trim() || null,
          }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        profile?: AiAgentProfile;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save profile");
        return;
      }
      if (data.profile) {
        setProfile(data.profile);
        // Re-sync the URL input from the server's normalised value so a
        // harmless transform (e.g. trailing-slash) doesn't make the Refresh
        // button look stuck. Same goes for an invalid URL the server
        // rejected — the input snaps back to the last saved value.
        setWebsiteUrl(data.profile.websiteUrl ?? "");
      }
      toast.success("Agent profile saved");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshKb() {
    setRefreshingKb(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ai-agent/profile/refresh-kb`,
        { method: "POST" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        profile?: AiAgentProfile;
        chars?: number;
        truncated?: boolean;
      };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to refresh knowledge base");
        return;
      }
      if (data.profile) setProfile(data.profile);
      toast.success(
        data.truncated
          ? `Captured ${data.chars} chars (homepage was longer — trimmed).`
          : `Captured ${data.chars} chars from the homepage.`,
      );
    } catch {
      toast.error("Network error — try again");
    } finally {
      setRefreshingKb(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestReply(null);
    setTestError(null);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/ai-agent/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: testMessage }),
        },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        reply?: string;
        error?: string;
      };
      if (!res.ok || !data.reply) {
        setTestError(data.error ?? "Test failed");
        return;
      }
      setTestReply(data.reply);
    } catch {
      setTestError("Network error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <User className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Agent profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            One persona, applied to every active channel. Configure here
            once — channels inherit and can override specific settings.
          </p>
        </div>
      </div>

      {!loaded ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form className="mt-6 space-y-5" onSubmit={handleSave}>
          <div className="space-y-1.5">
            <Label htmlFor="profile-prompt">Persona / system prompt</Label>
            <Textarea
              id="profile-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={DEFAULT_PROMPT_PLACEHOLDER}
              rows={6}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Use <code>{`{{businessName}}`}</code> for the business name.
              Channel-specific formatting (e.g. SMS ≤320 chars) is appended
              automatically.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-business-name">Business name</Label>
              <Input
                id="profile-business-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={subAccount?.name ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-notify-email">
                Default escalation email
              </Label>
              <Input
                id="profile-notify-email"
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-hours-start">Active from</Label>
              <select
                id="profile-hours-start"
                value={hoursStart}
                onChange={(e) => setHoursStart(Number(e.target.value))}
                className={NATIVE_SELECT_CLASSES}
              >
                {HOURS_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-hours-end">Until</Label>
              <select
                id="profile-hours-end"
                value={hoursEnd}
                onChange={(e) => setHoursEnd(Number(e.target.value))}
                className={NATIVE_SELECT_CLASSES}
              >
                {HOURS_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-tz">Timezone</Label>
              <TimezoneSelect
                id="profile-tz"
                value={timezone}
                onChange={setTimezone}
                className={NATIVE_SELECT_CLASSES}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Outside these hours, channels stay silent. Set start = end for
            24/7. Overnight windows like 22 → 6 work.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="profile-keywords">
              Default escalation keywords
            </Label>
            <Input
              id="profile-keywords"
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              placeholder="manager, human, complaint, stop ai"
            />
            <p className="text-[11px] text-muted-foreground">
              Comma-separated. When matched in an inbound, the bot stays
              silent and the escalation email is notified. Channels can
              override this list on their own page.
            </p>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div>
              <Label htmlFor="profile-website-url">Website knowledge base</Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Optional. Paste this client&rsquo;s public website. Save the
                profile, then click <strong>Refresh KB</strong> to crawl the
                homepage — the agent will reference it when replying.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                id="profile-website-url"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://your-client.com"
                className="flex-1"
              />
              {(() => {
                // The server normalises URLs (e.g. trailing slash, https://
                // prefix) so a strict compare with raw input falsely flags
                // "unsaved". Compare on a canonical form instead.
                const canon = (s: string) =>
                  s.trim().replace(/\/+$/, "").toLowerCase();
                const urlMatchesSaved =
                  !!profile?.websiteUrl &&
                  canon(profile.websiteUrl) === canon(websiteUrl);
                return (
              <Button
                type="button"
                variant="outline"
                onClick={handleRefreshKb}
                disabled={refreshingKb || !urlMatchesSaved}
                title={
                  !profile?.websiteUrl
                    ? "Save a website URL first"
                    : !urlMatchesSaved
                      ? "Save the changed URL before refreshing"
                      : "Re-crawl the homepage"
                }
              >
                {refreshingKb ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3.5 w-3.5" />
                )}
                Refresh KB
              </Button>
                );
              })()}
            </div>
            {profile?.websiteKb ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span>KB captured ({profile.websiteKb.length} chars)</span>
                {profile.websiteKbFetchedAt && (
                  <span>
                    · last refreshed{" "}
                    <span className="text-foreground">
                      {formatRelativeTime(profile.websiteKbFetchedAt)}
                    </span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setKbModalOpen(true)}
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
                >
                  <Eye className="h-3 w-3" />
                  View KB
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No KB captured yet.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save profile"
              )}
            </Button>
          </div>
        </form>
      )}

      {loaded && profile && systemPrompt.trim().length > 0 && (
        <div className="mt-6 rounded-xl border bg-muted/20 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            <h3 className="text-sm font-medium">Test this persona</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Dry-run the LLM with the saved persona + safety rails. No SMS
            sent, no contact touched.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Pretend you're a lead. Type a message..."
              className="flex-1"
            />
            <Button
              type="button"
              onClick={handleTest}
              disabled={testing || !testMessage.trim()}
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Test"
              )}
            </Button>
          </div>
          {testReply && (
            <div className="mt-3 rounded-lg border bg-background p-3 text-sm">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                AI would reply
              </p>
              <p className="mt-1.5 whitespace-pre-wrap">{testReply}</p>
            </div>
          )}
          {testError && (
            <p className="mt-3 text-xs text-destructive">{testError}</p>
          )}
        </div>
      )}

      <Dialog open={kbModalOpen} onOpenChange={setKbModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Website knowledge base</DialogTitle>
            <DialogDescription>
              {profile?.websiteUrl ?? "—"}
              {profile?.websiteKbFetchedAt && (
                <>
                  {" · "}captured{" "}
                  {formatRelativeTime(profile.websiteKbFetchedAt)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-xs leading-relaxed">
            {profile?.websiteKb ?? "(empty)"}
          </pre>
          <p className="text-[11px] text-muted-foreground">
            This is the exact snapshot fed to the AI as context. Re-click{" "}
            <strong>Refresh KB</strong> after the site changes.
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
}

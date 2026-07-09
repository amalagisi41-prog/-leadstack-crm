"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Globe,
  KeyRound,
  LayoutTemplate,
  Loader2,
  Mail,
  MessageCircle,
  MessagesSquare,
  PhoneOutgoing,
  Send,
  Share2,
  GraduationCap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SubAccountDoc } from "@/types";

/**
 * Agency-side per-sub-account management dialog. Hosts the agency-only
 * feature gates — controls the sub-account admin can't flip for themselves.
 * Opened from the agency sub-accounts list.
 *
 * Current gates:
 *   - Dedicated email sending domain (Resend slot per sub-account)
 *   - Public API access (REST + webhooks for /api/v1/*)
 *   - Broadcasts / Outbound AI calling / WhatsApp
 *   - Facebook + Instagram inbox (beta) — master switch, off by default
 *
 * Only visible to the agency owner (the list page gates rendering).
 * Disabling the email gate tears down the verified Resend domain; the API
 * gate keeps keys + subscriptions intact (so re-enabling resumes them
 * without re-rotating Zapier integrations). The dialog surfaces a warning
 * for the email tear-down only.
 */

interface Props {
  subAccount: SubAccountDoc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubAccountManageDialog({ subAccount, open, onOpenChange }: Props) {
  const initialEmail = subAccount?.emailDomainEnabledByAgency === true;
  const initialApi = subAccount?.apiAccessEnabledByAgency === true;
  const initialBroadcasts = subAccount?.broadcastsEnabledByAgency === true;
  const initialOutbound = subAccount?.outboundVoiceEnabledByAgency === true;
  const initialWhatsapp = subAccount?.whatsappEnabledByAgency === true;
  const initialMetaInbox = subAccount?.metaInboxEnabledByAgency === true;
  const initialWebsite = subAccount?.websiteEnabledByAgency === true;
  const initialWebsiteStudio =
    subAccount?.websiteStudioEnabledByAgency === true;
  const initialSocial = subAccount?.socialPlannerEnabledByAgency === true;
  const initialCommunity = subAccount?.communityEnabledByAgency === true;
  // "Hide instead of lock" overrides for the sidebar-gated features.
  const initialBroadcastsHidden =
    subAccount?.broadcastsHiddenWhenDisabled === true;
  const initialWebsiteHidden = subAccount?.websiteHiddenWhenDisabled === true;
  const initialSocialHidden =
    subAccount?.socialPlannerHiddenWhenDisabled === true;
  const initialCommunityHidden =
    subAccount?.communityHiddenWhenDisabled === true;
  const hasLiveDomain = !!subAccount?.resendConfig;
  const [emailDomainEnabled, setEmailDomainEnabled] = useState(initialEmail);
  const [apiAccessEnabled, setApiAccessEnabled] = useState(initialApi);
  const [broadcastsEnabled, setBroadcastsEnabled] = useState(initialBroadcasts);
  const [outboundVoiceEnabled, setOutboundVoiceEnabled] =
    useState(initialOutbound);
  const [whatsappEnabled, setWhatsappEnabled] = useState(initialWhatsapp);
  const [metaInboxEnabled, setMetaInboxEnabled] = useState(initialMetaInbox);
  const [websiteEnabled, setWebsiteEnabled] = useState(initialWebsite);
  const [websiteStudioEnabled, setWebsiteStudioEnabled] =
    useState(initialWebsiteStudio);
  const [socialPlannerEnabled, setSocialPlannerEnabled] =
    useState(initialSocial);
  const [communityEnabled, setCommunityEnabled] = useState(initialCommunity);
  const [broadcastsHidden, setBroadcastsHidden] = useState(
    initialBroadcastsHidden,
  );
  const [websiteHidden, setWebsiteHidden] = useState(initialWebsiteHidden);
  const [socialHidden, setSocialHidden] = useState(initialSocialHidden);
  const [communityHidden, setCommunityHidden] = useState(
    initialCommunityHidden,
  );
  const [saving, setSaving] = useState(false);
  // Whether the deployment has Meta app creds (META_APP_ID/SECRET). null while
  // loading. The FB/IG inbox + Social Planner gates depend on it, so they're
  // grayed out when it's false. Fetched once when the dialog first opens.
  const [metaConfigured, setMetaConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open || metaConfigured !== null) return;
    let cancelled = false;
    void fetch("/api/agency/deployment-config")
      .then((r) => r.json())
      .then((d: { metaConfigured?: boolean }) => {
        if (!cancelled) setMetaConfigured(d.metaConfigured === true);
      })
      .catch(() => {
        // On failure, don't block the agency owner — assume configured.
        if (!cancelled) setMetaConfigured(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, metaConfigured]);

  // Re-sync local state every time the dialog opens or the target sub-account
  // changes, so consecutive opens don't show stale toggle state.
  useEffect(() => {
    if (open) {
      setEmailDomainEnabled(initialEmail);
      setApiAccessEnabled(initialApi);
      setBroadcastsEnabled(initialBroadcasts);
      setOutboundVoiceEnabled(initialOutbound);
      setWhatsappEnabled(initialWhatsapp);
      setMetaInboxEnabled(initialMetaInbox);
      setWebsiteEnabled(initialWebsite);
      setSocialPlannerEnabled(initialSocial);
      setCommunityEnabled(initialCommunity);
      setBroadcastsHidden(initialBroadcastsHidden);
      setWebsiteHidden(initialWebsiteHidden);
      setSocialHidden(initialSocialHidden);
      setCommunityHidden(initialCommunityHidden);
    }
  }, [
    open,
    initialEmail,
    initialApi,
    initialBroadcasts,
    initialOutbound,
    initialWhatsapp,
    initialMetaInbox,
    initialWebsite,
    initialSocial,
    initialCommunity,
    initialBroadcastsHidden,
    initialWebsiteHidden,
    initialSocialHidden,
    initialCommunityHidden,
    subAccount?.id,
  ]);

  if (!subAccount) return null;

  const willTearDown =
    initialEmail && !emailDomainEnabled && hasLiveDomain;
  const emailDirty = emailDomainEnabled !== initialEmail;
  const apiDirty = apiAccessEnabled !== initialApi;
  const broadcastsDirty = broadcastsEnabled !== initialBroadcasts;
  const outboundDirty = outboundVoiceEnabled !== initialOutbound;
  const whatsappDirty = whatsappEnabled !== initialWhatsapp;
  const metaInboxDirty = metaInboxEnabled !== initialMetaInbox;
  const websiteDirty = websiteEnabled !== initialWebsite;
  const websiteStudioDirty = websiteStudioEnabled !== initialWebsiteStudio;
  const socialDirty = socialPlannerEnabled !== initialSocial;
  const communityDirty = communityEnabled !== initialCommunity;
  const broadcastsHiddenDirty = broadcastsHidden !== initialBroadcastsHidden;
  const websiteHiddenDirty = websiteHidden !== initialWebsiteHidden;
  const socialHiddenDirty = socialHidden !== initialSocialHidden;
  const communityHiddenDirty = communityHidden !== initialCommunityHidden;
  const dirty =
    emailDirty ||
    apiDirty ||
    broadcastsDirty ||
    outboundDirty ||
    whatsappDirty ||
    metaInboxDirty ||
    websiteDirty ||
    websiteStudioDirty ||
    socialDirty ||
    communityDirty ||
    broadcastsHiddenDirty ||
    websiteHiddenDirty ||
    socialHiddenDirty ||
    communityHiddenDirty;

  // Meta features can't work without app creds on the deployment. Gray out the
  // two Meta gates when unconfigured — but still allow turning an already-on
  // gate OFF (don't trap a legacy enabled state).
  const metaUnconfigured = metaConfigured === false;

  async function handleSave() {
    if (!subAccount) return;
    setSaving(true);
    try {
      // Only send the fields the agency owner actually changed. Keeps the
      // PATCH minimal and avoids redundant tear-down attempts when nothing
      // about email changed.
      const payload: {
        emailDomainEnabled?: boolean;
        apiAccessEnabled?: boolean;
        broadcastsEnabled?: boolean;
        outboundVoiceEnabled?: boolean;
        whatsappEnabled?: boolean;
        metaInboxEnabled?: boolean;
        websiteEnabled?: boolean;
        websiteStudioEnabled?: boolean;
        socialPlannerEnabled?: boolean;
        communityEnabled?: boolean;
        broadcastsHiddenWhenDisabled?: boolean;
        websiteHiddenWhenDisabled?: boolean;
        socialPlannerHiddenWhenDisabled?: boolean;
        communityHiddenWhenDisabled?: boolean;
      } = {};
      if (emailDirty) payload.emailDomainEnabled = emailDomainEnabled;
      if (apiDirty) payload.apiAccessEnabled = apiAccessEnabled;
      if (broadcastsDirty) payload.broadcastsEnabled = broadcastsEnabled;
      if (outboundDirty) payload.outboundVoiceEnabled = outboundVoiceEnabled;
      if (whatsappDirty) payload.whatsappEnabled = whatsappEnabled;
      if (metaInboxDirty) payload.metaInboxEnabled = metaInboxEnabled;
      if (websiteDirty) payload.websiteEnabled = websiteEnabled;
      if (websiteStudioDirty)
        payload.websiteStudioEnabled = websiteStudioEnabled;
      if (socialDirty) payload.socialPlannerEnabled = socialPlannerEnabled;
      if (communityDirty) payload.communityEnabled = communityEnabled;
      if (broadcastsHiddenDirty)
        payload.broadcastsHiddenWhenDisabled = broadcastsHidden;
      if (websiteHiddenDirty)
        payload.websiteHiddenWhenDisabled = websiteHidden;
      if (socialHiddenDirty)
        payload.socialPlannerHiddenWhenDisabled = socialHidden;
      if (communityHiddenDirty)
        payload.communityHiddenWhenDisabled = communityHidden;

      const res = await fetch(
        `/api/agency/sub-accounts/${subAccount.id}/feature-gates`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        clearedDomain?: boolean;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save.");
      }
      // Build the toast message from whatever the agency owner actually
      // changed. Single message covers both toggles flipped at once.
      const parts: string[] = [];
      if (emailDirty) {
        parts.push(
          emailDomainEnabled
            ? "Email sending domain enabled."
            : data.clearedDomain
              ? "Email sending domain disabled (live domain removed, reverted to shared sender)."
              : "Email sending domain disabled.",
        );
      }
      if (apiDirty) {
        parts.push(
          apiAccessEnabled
            ? "API access enabled."
            : "API access disabled. Existing keys + webhooks preserved but inert until re-enabled.",
        );
      }
      if (broadcastsDirty) {
        parts.push(
          broadcastsEnabled
            ? "Broadcasts enabled."
            : "Broadcasts disabled. Historical broadcasts preserved; new sends blocked until re-enabled.",
        );
      }
      if (outboundDirty) {
        parts.push(
          outboundVoiceEnabled
            ? "Outbound calling enabled."
            : "Outbound calling disabled. New calls blocked until re-enabled.",
        );
      }
      if (whatsappDirty) {
        parts.push(
          whatsappEnabled
            ? "WhatsApp enabled."
            : "WhatsApp disabled. The channel goes silent; Twilio creds preserved.",
        );
      }
      if (metaInboxDirty) {
        parts.push(
          metaInboxEnabled
            ? "Facebook + Instagram inbox (beta) enabled."
            : "Facebook + Instagram inbox (beta) disabled. The channels go silent and hidden.",
        );
      }
      if (websiteDirty) {
        parts.push(
          websiteEnabled
            ? "Website builder enabled."
            : "Website builder disabled. New builds blocked; existing site preserved.",
        );
      }
      if (socialDirty) {
        parts.push(
          socialPlannerEnabled
            ? "Social Planner enabled."
            : "Social Planner disabled. Scheduled posts + Meta connection preserved.",
        );
      }
      if (communityDirty) {
        parts.push(
          communityEnabled
            ? "Community enabled."
            : "Community disabled. Members, posts, and courses preserved; the public pages go offline.",
        );
      }
      // "Hide instead of lock" changes. Only meaningful while the feature is
      // off; mention the current effect so the agency owner knows what the
      // tenant will see.
      const hiddenChanges: string[] = [];
      if (broadcastsHiddenDirty)
        hiddenChanges.push(`Broadcasts ${broadcastsHidden ? "hidden" : "shown as Locked"}`);
      if (websiteHiddenDirty)
        hiddenChanges.push(`Website ${websiteHidden ? "hidden" : "shown as Locked"}`);
      if (socialHiddenDirty)
        hiddenChanges.push(`Social Planner ${socialHidden ? "hidden" : "shown as Locked"}`);
      if (communityHiddenDirty)
        hiddenChanges.push(`Community ${communityHidden ? "hidden" : "shown as Locked"}`);
      if (hiddenChanges.length > 0) {
        parts.push(`When disabled: ${hiddenChanges.join(", ")}.`);
      }
      toast.success(parts.join(" "));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage {subAccount.name}</DialogTitle>
          <DialogDescription>
            Agency-level controls for this sub-account. Sub-account admins
            can&apos;t flip these — that&apos;s the point.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <GateToggle
            checked={emailDomainEnabled}
            onChange={setEmailDomainEnabled}
            disabled={saving}
            icon={<Mail className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />}
            title="Dedicated email sending domain"
          >
            When enabled, this sub-account can register its own subdomain so its
            email sends from its own brand. Consumes one slot on your Resend plan
            (Free = 1 domain total, Pro = 10, Scale = 1,000).
          </GateToggle>

          <GateToggle
            checked={apiAccessEnabled}
            onChange={setApiAccessEnabled}
            disabled={saving}
            icon={<KeyRound className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />}
            title="Public API access"
          >
            When enabled, this sub-account can mint API keys + webhooks for
            Zapier, Make, custom landing pages, etc. Disabling immediately stops
            all <code>/api/v1/*</code> traffic from their existing keys but keeps
            the keys + subscriptions intact, so re-enabling later doesn&apos;t
            force the client to re-rotate their integrations.
          </GateToggle>

          <GateToggle
            checked={broadcastsEnabled}
            onChange={setBroadcastsEnabled}
            disabled={saving}
            icon={<Send className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
            title="Broadcasts"
            hideOption={{
              hidden: broadcastsHidden,
              onHiddenChange: setBroadcastsHidden,
              disabled: saving,
            }}
          >
            When enabled, this sub-account can send bulk email broadcasts (up to
            25,000 recipients per send) to filtered audiences. Disabling locks
            the Broadcasts sidebar entry and returns 403 on new send attempts;
            historical broadcast docs and in-flight QStash messages are preserved.
          </GateToggle>

          <GateToggle
            checked={websiteEnabled}
            onChange={setWebsiteEnabled}
            disabled={saving}
            icon={<Globe className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />}
            title="Website"
            hideOption={{
              hidden: websiteHidden,
              onHiddenChange: setWebsiteHidden,
              disabled: saving,
            }}
          >
            When enabled, this sub-account can build and publish a marketing
            site through the website builder (gitpage.site). Builds draw on your
            agency&apos;s shared gitpage quota (30 builds/hour across all
            sub-accounts). Disabling locks the Website sidebar entry and returns
            403 on new build attempts; the existing config and any published
            site are preserved, so re-enabling resumes instantly.
          </GateToggle>

          <GateToggle
            checked={websiteStudioEnabled}
            onChange={setWebsiteStudioEnabled}
            disabled={saving}
            icon={<LayoutTemplate className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />}
            title="AI Website Studio (premium add-on)"
          >
            When enabled, this sub-account gets AI Website Studio — the AI-guided,
            premium-template agent website builder, plus its bundled setup
            assists (A2P guidance, chat-widget help, SEO). Sold as a paid
            add-on, so enable it only for sub-accounts that have paid for the
            tier. Disabling locks the AI Website Studio sidebar entry and 403s the
            builder routes; the site draft and any published page are preserved.
          </GateToggle>

          <GateToggle
            checked={outboundVoiceEnabled}
            onChange={setOutboundVoiceEnabled}
            disabled={saving}
            icon={<PhoneOutgoing className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />}
            title="Outbound AI calling"
          >
            When enabled, this sub-account can place outbound AI voice calls to
            contacts (&quot;Call with AI&quot;). Reuses the same Vapi number as
            inbound voice. Consumes call minutes and carries compliance weight —
            a built-in gate enforces opt-out, calling hours, and rate limits, but
            you control whether the feature is available at all. Disabling blocks
            new calls; no resources are torn down.
          </GateToggle>

          <GateToggle
            checked={whatsappEnabled}
            onChange={setWhatsappEnabled}
            disabled={saving}
            icon={<MessageCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />}
            title="WhatsApp"
          >
            When enabled, this sub-account can turn on the WhatsApp AI channel
            (inbound auto-replies via their Twilio WhatsApp sender). Reuses the
            same Twilio credentials as SMS. Disabling silences the channel and
            makes the inbound webhook ignore this sub-account; no credentials are
            torn down, so re-enabling resumes instantly.
          </GateToggle>

          <GateToggle
            checked={metaInboxEnabled}
            onChange={setMetaInboxEnabled}
            disabled={saving || (metaUnconfigured && !initialMetaInbox)}
            icon={<MessagesSquare className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" />}
            title="Facebook + Instagram inbox (beta)"
          >
            When enabled, this sub-account can connect a Facebook Page +
            Instagram business account so Messenger and IG DMs land in the
            unified inbox alongside SMS/WhatsApp. <strong>Beta</strong> — both
            channels ride one Meta connection and stay completely hidden until
            you switch this on; off is the default for every sub-account.
            Disabling silences and hides the channels; nothing is torn down, so
            re-enabling resumes instantly. Leave off for any client that doesn&apos;t
            actively use Facebook/Instagram messaging.
            {metaUnconfigured && (
              <span className="mt-1 block font-medium text-amber-600 dark:text-amber-400">
                Unavailable — set <code>META_APP_ID</code> and{" "}
                <code>META_APP_SECRET</code> on the deployment to enable.
              </span>
            )}
          </GateToggle>

          <GateToggle
            checked={socialPlannerEnabled}
            onChange={setSocialPlannerEnabled}
            disabled={saving || (metaUnconfigured && !initialSocial)}
            icon={<Share2 className="h-3.5 w-3.5 text-fuchsia-600 dark:text-fuchsia-400" />}
            title="Social Planner (beta)"
            hideOption={{
              hidden: socialHidden,
              onHiddenChange: setSocialHidden,
              disabled: saving,
            }}
          >
            When enabled, this sub-account can connect a Facebook Page +
            Instagram business account and schedule posts that auto-publish at
            the chosen time. <strong>Beta</strong> — posting reuses the same
            Meta connection as the inbox plus extra publish permissions
            (requires Meta App Review). Disabling locks the Social Planner
            sidebar entry and 403s the connect/publish routes; scheduled posts
            and the connection are preserved, so re-enabling resumes instantly.
            {metaUnconfigured && (
              <span className="mt-1 block font-medium text-amber-600 dark:text-amber-400">
                Unavailable — set <code>META_APP_ID</code> and{" "}
                <code>META_APP_SECRET</code> on the deployment to enable.
              </span>
            )}
          </GateToggle>

          <GateToggle
            checked={communityEnabled}
            onChange={setCommunityEnabled}
            disabled={saving}
            icon={<GraduationCap className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />}
            title="Community + Courses"
            hideOption={{
              hidden: communityHidden,
              onHiddenChange: setCommunityHidden,
              disabled: saving,
            }}
          >
            When enabled, this sub-account can run Skool-style community groups —
            a member feed, courses, and a leaderboard at a branded public link
            (<code>/c/…</code>). Members sign in with a magic link and become
            CRM contacts. Disabling locks the Community sidebar entry AND takes
            the public group pages offline; members, posts, and courses are
            preserved, so re-enabling resumes instantly.
          </GateToggle>
        </div>

        {willTearDown && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This will remove the live sending domain{" "}
              <code className="rounded bg-amber-500/10 px-1">
                {subAccount.resendConfig?.domainName}
              </code>{" "}
              from Resend and revert this sub-account to the shared sender. In-flight
              broadcasts and automations will fall back automatically.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GateToggle({
  checked,
  onChange,
  disabled,
  icon,
  title,
  children,
  hideOption,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  /**
   * Optional "hide instead of lock" secondary control. Only the three
   * sidebar-gated features pass this. The sub-checkbox is only shown while the
   * feature is OFF (`!checked`) — there's no Locked state to hide when it's on.
   * Its `disabled` is independent of the main toggle's: hiding the Locked row is
   * pure presentation, so it stays available even when the feature itself can't
   * be enabled (e.g. a Meta feature with no app creds on the deployment).
   */
  hideOption?: {
    hidden: boolean;
    onHiddenChange: (value: boolean) => void;
    disabled?: boolean;
  };
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40",
      )}
    >
      <label className="flex cursor-pointer items-start gap-3 p-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 cursor-pointer"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            {icon}
            {title}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{children}</p>
        </div>
      </label>
      {hideOption && !checked && (
        <label className="flex cursor-pointer items-start gap-2 border-t border-dashed px-3 py-2 pl-10 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={hideOption.hidden}
            onChange={(e) => hideOption.onHiddenChange(e.target.checked)}
            disabled={hideOption.disabled}
            className="mt-0.5 h-3.5 w-3.5 cursor-pointer"
          />
          <span>
            <span className="font-medium text-foreground">
              Hide from the sub-account entirely
            </span>{" "}
            — omit the sidebar entry instead of showing a greyed{" "}
            <span className="font-medium">Locked</span> item, so they never know
            the feature exists.
          </span>
        </label>
      )}
    </div>
  );
}

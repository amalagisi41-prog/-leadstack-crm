"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { doc, onSnapshot } from "firebase/firestore";
import {
  Building,
  Calendar,
  Facebook,
  FileUp,
  Lock,
  Mail,
  MessageSquare,
  MessagesSquare,
  Phone,
  Search,
  Star,
  Upload,
  Globe2,
  Code2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { metaCanInbox } from "@/lib/comms/meta-capabilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EasyConnectorsSection } from "@/components/connect/easy-connectors-section";
import { GoogleGIcon } from "@/components/brand/google-g-icon";
import { googleAccountConnectPath } from "@/lib/google/account-connect-path";

type ConnectionStatus =
  | "connected"
  | "needs_attention"
  | "not_connected"
  | "coming_soon";

interface ConnectionCardData {
  key: string;
  icon: React.ElementType;
  iconTone: string;
  title: string;
  /** Small colored line under the title — the connected account/number/
   *  domain, mirroring how a real integrations marketplace shows "which
   *  one" once connected (e.g. a Google account email). Only status-
   *  appropriate detail, never a generic badge. */
  detail?: string;
  detailTone?: string;
  blurb: string;
  status: ConnectionStatus;
  actionLabel: string;
  actionHref?: string;
}

function ConnectionCard({ data }: { data: ConnectionCardData }) {
  const disabled = data.status === "coming_soon";
  const statusLabel =
    data.status === "connected"
      ? "Connected"
      : data.status === "needs_attention"
        ? "Needs attention"
        : data.status === "coming_soon"
          ? "Not available"
          : "Not connected";

  return (
    <div className="bg-card flex h-full flex-col rounded-2xl border p-5">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          data.iconTone
        )}
      >
        <data.icon className="h-5 w-5" />
      </span>

      <div className="mt-3">
        <h3 className="text-sm font-semibold">{data.title}</h3>
        <span
          className={cn(
            "mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
            data.status === "connected" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
            data.status === "needs_attention" && "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
            data.status === "not_connected" && "bg-muted text-muted-foreground",
            data.status === "coming_soon" && "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
          )}
        >
          {statusLabel}
        </span>
        {data.detail && (
          <p
            className={cn(
              "mt-0.5 truncate text-xs font-medium",
              data.detailTone ?? "text-emerald-600 dark:text-emerald-400"
            )}
          >
            {data.detail}
          </p>
        )}
      </div>

      <p className="text-muted-foreground mt-2 flex-1 text-xs leading-relaxed">
        {data.blurb}
      </p>

      <div className="mt-4">
        {disabled ? (
          <Button size="sm" variant="outline" className="w-full" disabled>
            <Lock className="mr-1.5 h-3 w-3" />
            {data.actionLabel}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            render={
              data.actionHref
                ? data.actionHref.startsWith("/api/")
                  ? <a href={data.actionHref} />
                  : <Link href={data.actionHref} />
                : undefined
            }
          >
            {data.actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * "Connect Your Business" — the single user-facing integrations screen for
 * AgentStack Solo. A flat, searchable card grid (icon + connected-account detail
 * + one action) — every card is read-only status + a deep link to the real
 * configuration surface in Settings or the relevant feature page, mirroring
 * the Social Planner Connections tab's established pattern rather than
 * duplicating each integration's setup form here. Only integrations that
 * actually exist in the product are listed — never a placeholder for a
 * third-party tool this deployment can't actually connect to.
 */
export function ConnectYourBusiness() {
  const { subAccount, saPath } = useSubAccount();
  const [webChatEnabled, setWebChatEnabled] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const searchParams = useSearchParams();
  const googleResult = searchParams.get("google");
  const googleError = searchParams.get("google_error");

  useEffect(() => {
    if (googleResult === "connected") {
      toast.success("Google account connected.");
    } else if (googleResult === "error") {
      const reason =
        googleError === "access_denied"
          ? "Google access was not granted."
          : googleError === "not_configured"
            ? "Google sign-in is not configured on this deployment yet."
            : googleError === "admin_only"
              ? "Only a sub-account admin can connect Google."
              : "Google connection did not finish. Try again.";
      toast.error(reason);
    }
  }, [googleResult, googleError]);

  useEffect(() => {
    if (!subAccount) return;
    return onSnapshot(
      doc(getFirebaseDb(), `subAccounts/${subAccount.id}/aiAgent/web-chat`),
      (snap) =>
        setWebChatEnabled(
          snap.exists() ? snap.data()?.enabled === true : false
        ),
      () => setWebChatEnabled(null)
    );
  }, [subAccount]);


  const cards = useMemo<ConnectionCardData[]>(() => {
    if (!subAccount) return [];

    const settingsHref = saPath("/dashboard/settings");
    const mlsFeedHref = `${settingsHref}#mls-feed`;
    const apiSettingsHref = `${settingsHref}?tab=api`;
    const googleReviewsHref = `${settingsHref}?tab=messaging#google-reviews`;
    const contactsHref = saPath("/contacts");
    const formsHref = saPath("/forms");
    const aiAgentsHref = saPath("/ai-agents/web-chat");
    const domainHref = saPath("/domain");
    const calendarHref = `${settingsHref}#calendar-connection`;
    const googleAccount = subAccount.googleAccountConfig ?? null;

    const smsConnected = subAccount.twilioConfig?.enabled === true;
    const emailDomainVerified =
      subAccount.emailDomainEnabledByAgency === true &&
      subAccount.resendConfig?.status === "verified";
    const emailDomainNeedsAttention =
      subAccount.emailDomainEnabledByAgency === true &&
      subAccount.resendConfig != null &&
      subAccount.resendConfig.status !== "verified";

    const metaConnected = metaCanInbox(subAccount.metaConfig ?? null);
    const metaNeedsAttention =
      !!subAccount.metaConfig?.connected && !metaConnected;

    const idxConfigured =
      subAccount.idxEnabledByAgency === true &&
      subAccount.idxConfig?.enabled === true;
    const idxNeedsAttention =
      subAccount.idxEnabledByAgency === true && !subAccount.idxConfig?.enabled;

    return [
      {
        key: "domain-hosting",
        icon: Globe2,
        iconTone: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
        title: "Domain & external host",
        detail: subAccount.customDomain ?? undefined,
        blurb:
          "Have AgentStack review your existing site and content while your domain and hosting remain with your current provider.",
        status:
          subAccount.customDomainState === "live"
            ? "connected"
            : subAccount.customDomainState === "points_elsewhere" ||
                subAccount.customDomainState === "no_records" ||
                subAccount.customDomainState === "unknown"
              ? "needs_attention"
              : "not_connected",
        actionLabel: subAccount.customDomain
          ? "Manage domain"
          : "Connect domain",
        actionHref: domainHref,
      },
      {
        key: "api-automation",
        icon: Code2,
        iconTone: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
        title: "Zapier, Make & API",
        blurb:
          "Connect supported automation tools through secure API keys and outbound webhooks.",
        status: subAccount.apiAccessEnabledByAgency
          ? "connected"
          : "not_connected",
        actionLabel: subAccount.apiAccessEnabledByAgency ? "Manage" : "Set up",
        actionHref: apiSettingsHref,
      },
      {
        key: "email",
        icon: Mail,
        iconTone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        title: "Business email",
        detail: emailDomainNeedsAttention
          ? "Verification pending"
          : emailDomainVerified
            ? (subAccount.resendConfig?.emailFrom ?? "Connected")
            : undefined,
        detailTone: emailDomainNeedsAttention
          ? "text-amber-600 dark:text-amber-400"
          : undefined,
        blurb:
          "Send from your own address so replies land in your inbox, not ours.",
        status: emailDomainNeedsAttention
          ? "needs_attention"
          : emailDomainVerified
            ? "connected"
            : "not_connected",
        actionLabel: emailDomainVerified ? "Manage" : "Connect",
        actionHref: settingsHref,
      },
      {
        key: "sms",
        icon: Phone,
        iconTone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
        title: "Text messaging",
        detail: smsConnected
          ? (subAccount.twilioConfig?.fromNumber ?? "Connected")
          : undefined,
        blurb: "Your own number for two-way SMS with leads and clients.",
        status: smsConnected ? "connected" : "not_connected",
        actionLabel: smsConnected ? "Manage" : "Connect",
        actionHref: settingsHref,
      },
      {
        key: "chat-widget",
        icon: MessageSquare,
        iconTone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
        title: "Chat widget",
        detail: webChatEnabled ? "Configured — verify install" : undefined,
        blurb:
          "An AI-answered chat bubble for your website. After enabling it, paste the snippet into the existing site and verify it here.",
        status: webChatEnabled ? "needs_attention" : "not_connected",
        actionLabel: webChatEnabled ? "Verify install" : "Connect",
        actionHref: aiAgentsHref,
      },
      {
        key: "meta",
        icon: Facebook,
        iconTone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
        title: "Facebook & Instagram",
        detail: metaNeedsAttention
          ? "Reconnect needed"
          : metaConnected
            ? (subAccount.metaConfig?.pageName ?? "Connected")
            : undefined,
        detailTone: metaNeedsAttention
          ? "text-amber-600 dark:text-amber-400"
          : undefined,
        blurb: "Reply to Messenger and Instagram DMs from one inbox.",
        status: metaNeedsAttention
          ? "needs_attention"
          : metaConnected
            ? "connected"
            : "not_connected",
        actionLabel: metaConnected ? "Manage" : "Connect",
        actionHref: settingsHref,
      },
      {
        key: "calendar",
        icon: Calendar,
        iconTone: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
        title: "Google or Outlook Calendar",
        detail: subAccount.calendarConfig?.email ?? undefined,
        blurb:
          "Authorize the calendar you already use. OAuth credentials stay server-side; AgentStack never asks you to paste a calendar URL or password.",
        status: subAccount.calendarConfig?.status === "connected" ? "connected" : "not_connected",
        actionLabel: subAccount.calendarConfig?.status === "connected" ? "Manage calendar" : "Connect calendar",
        actionHref: calendarHref,
      },
      {
        key: "booking",
        icon: Calendar,
        iconTone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        title: "Booking pages",
        detail: "Live",
        blurb: "A public link where leads pick an open slot on your calendar.",
        status: "connected",
        actionLabel: "Manage",
        actionHref: saPath("/booking"),
      },
      {
        key: "csv-import",
        icon: FileUp,
        iconTone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
        title: "CSV import",
        blurb: "Upload a spreadsheet of contacts from any other tool.",
        status: "connected",
        actionLabel: "Import",
        actionHref: `${contactsHref}?import=1`,
      },
      {
        key: "forms",
        icon: Upload,
        iconTone: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
        title: "Website forms",
        detail: "Live",
        blurb:
          "A hosted form or iframe embed that creates a contact on submit.",
        status: "connected",
        actionLabel: "Manage",
        actionHref: formsHref,
      },
      {
        key: "mls-feed",
        icon: Building,
        iconTone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        title: "Listings & MLS feed",
        detail: idxNeedsAttention
          ? "Choose your approved feed"
          : idxConfigured
            ? (subAccount.idxConfig?.mlsId ? `MLS ${subAccount.idxConfig.mlsId} connected` : "Connected — choose MLS")
            : undefined,
        detailTone: idxNeedsAttention
          ? "text-amber-600 dark:text-amber-400"
          : undefined,
        blurb:
          "Connect your authorized SmartMLS or other MLS feed through IDX Broker, then sync listings into Properties. AgentStack never asks for your MLS password.",
        status: idxNeedsAttention
          ? "needs_attention"
          : idxConfigured
            ? "connected"
            : "not_connected",
        actionLabel: idxConfigured ? "Manage MLS feed" : "Manage listings",
        actionHref: idxConfigured ? mlsFeedHref : saPath("/idx"),
      },
      {
        key: "google-account",
        icon: GoogleGIcon,
        iconTone: "bg-white text-foreground ring-1 ring-border",
        title: "Google Profile",
        detail: googleAccount?.email || undefined,
        blurb:
          "Connect your Google account once: profile, Gmail sending, Google Calendar, and Business Profile. OAuth keeps credentials server-side.",
        status: googleAccount?.status === "connected" ? "connected" : "not_connected",
        actionLabel: googleAccount?.status === "connected" ? "Reconnect Google" : "Connect Google",
        actionHref: googleAccountConnectPath(subAccount.id),
      },
      {
        key: "google-reviews",
        icon: Star,
        iconTone: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        title: "Google reviews",
        detail: subAccount.googleReviewConfig?.reviewUrl ? "Configured" : undefined,
        blurb:
          "Save your Google review link and configure review request settings.",
        status: subAccount.googleReviewConfig?.reviewUrl ? "connected" : "not_connected",
        actionLabel: "Configure reviews",
        actionHref: googleReviewsHref,
      },
    ];
  }, [subAccount, saPath, webChatEnabled]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.blurb.toLowerCase().includes(q)
    );
  }, [cards, search]);

  if (!subAccount) {
    return <div className="bg-muted/30 h-64 animate-pulse rounded-2xl" />;
  }

  return (
    <div className="space-y-6 pb-12">
      <EasyConnectorsSection />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connect your business</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Start with a goal above. AS will guide you to the right connection; this is the full connection list when you need it.
          </p>
        </div>
      </div>

      <details className="rounded-2xl border bg-card">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold">
          See all connections
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {filtered.length} available
          </span>
        </summary>
        <div className="border-t p-5">
          <div className="mb-4 flex justify-end">
            <div className="relative w-full sm:w-64">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search connections"
                className="pl-9"
              />
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
              No integrations match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((card) => (
                <ConnectionCard key={card.key} data={card} />
              ))}
            </div>
          )}
        </div>
      </details>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <MessagesSquare className="h-3.5 w-3.5" />
        Once connected, replies show up together in Conversations regardless of
        which channel a lead used.
      </p>

    </div>
  );
}

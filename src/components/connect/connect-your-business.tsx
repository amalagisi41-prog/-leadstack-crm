"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot } from "firebase/firestore";
import {
  Building,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Facebook,
  FileUp,
  Lock,
  Mail,
  MessageSquare,
  MessagesSquare,
  Phone,
  Sparkles,
  Upload,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { metaCanInbox } from "@/lib/comms/meta-capabilities";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectionStatus = "connected" | "needs_attention" | "not_connected" | "coming_soon";

interface ConnectionCardData {
  key: string;
  icon: React.ElementType;
  iconTone: string;
  title: string;
  blurb: string;
  setupTime: string;
  status: ConnectionStatus;
  statusDetail?: string;
  actionLabel: string;
  actionHref?: string;
}

const STATUS_META: Record<
  ConnectionStatus,
  { label: string; icon: React.ElementType; tone: string }
> = {
  connected: {
    label: "Connected",
    icon: CheckCircle2,
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  needs_attention: {
    label: "Needs attention",
    icon: Circle,
    tone: "text-amber-600 dark:text-amber-400",
  },
  not_connected: {
    label: "Not connected",
    icon: Circle,
    tone: "text-muted-foreground",
  },
  coming_soon: {
    label: "Coming soon",
    icon: Clock,
    tone: "text-muted-foreground",
  },
};

function ConnectionCard({ data }: { data: ConnectionCardData }) {
  const status = STATUS_META[data.status];
  const StatusIcon = status.icon;
  const disabled = data.status === "coming_soon";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5",
        disabled && "opacity-70",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            data.iconTone,
          )}
        >
          <data.icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{data.title}</h3>
            <span className="text-[11px] text-muted-foreground">
              · {data.setupTime}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{data.blurb}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", status.tone)}>
          <StatusIcon className="h-3.5 w-3.5" />
          {status.label}
          {data.statusDetail && (
            <span className="font-normal text-muted-foreground">
              — {data.statusDetail}
            </span>
          )}
        </span>
        {disabled ? (
          <Button size="sm" variant="outline" disabled>
            <Lock className="mr-1 h-3 w-3" />
            {data.actionLabel}
          </Button>
        ) : (
          <Button
            size="sm"
            variant={data.status === "connected" ? "outline" : "default"}
            render={data.actionHref ? <Link href={data.actionHref} /> : undefined}
          >
            {data.actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h2>
  );
}

/**
 * "Connect Your Business" — the single user-facing integrations screen for
 * Solo Beta. Groups connections by outcome (Communication / Scheduling /
 * Contacts / Lead Capture / Optional Growth), not by backend technology.
 * Every card is read-only status + one action that deep-links to the real
 * configuration surface in Settings or the relevant feature page — this
 * mirrors the Social Planner Connections tab's established pattern rather
 * than duplicating each integration's setup form here.
 */
export function ConnectYourBusiness() {
  const { subAccount, saPath } = useSubAccount();
  const [webChatEnabled, setWebChatEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!subAccount) return;
    return onSnapshot(
      doc(getFirebaseDb(), `subAccounts/${subAccount.id}/aiAgent/web-chat`),
      (snap) => setWebChatEnabled(snap.exists() ? snap.data()?.enabled === true : false),
      () => setWebChatEnabled(null),
    );
  }, [subAccount]);

  if (!subAccount) {
    return (
      <div className="h-64 animate-pulse rounded-2xl bg-muted/30" />
    );
  }

  const settingsHref = saPath("/dashboard/settings");
  const contactsHref = saPath("/contacts");
  const formsHref = saPath("/forms");
  const aiAgentsHref = saPath("/ai-agents/web-chat");
  const idxHref = saPath("/idx");

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
    subAccount.idxEnabledByAgency === true && subAccount.idxConfig?.enabled === true;
  const idxNeedsAttention =
    subAccount.idxEnabledByAgency === true && !subAccount.idxConfig?.enabled;

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connect Your Business</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The tools your AI assistants and follow-ups run on. Connect what you
          need — everything else stays off until you turn it on.
        </p>
      </div>

      <section>
        <GroupHeading>Communication</GroupHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            data={{
              key: "email",
              icon: Mail,
              iconTone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              title: "Business email",
              blurb:
                "Send from your own address so replies land in your inbox, not ours.",
              setupTime: "2 min",
              status: emailDomainNeedsAttention
                ? "needs_attention"
                : emailDomainVerified
                  ? "connected"
                  : "not_connected",
              statusDetail: emailDomainNeedsAttention
                ? "verification pending"
                : !emailDomainVerified
                  ? "using the shared sender for now"
                  : undefined,
              actionLabel: emailDomainVerified ? "Manage" : "Connect",
              actionHref: settingsHref,
            }}
          />
          <ConnectionCard
            data={{
              key: "sms",
              icon: Phone,
              iconTone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
              title: "Text messaging",
              blurb: "Your own number for two-way SMS with leads and clients.",
              setupTime: "3 min",
              status: smsConnected ? "connected" : "not_connected",
              actionLabel: smsConnected ? "Manage" : "Connect",
              actionHref: settingsHref,
            }}
          />
        </div>
      </section>

      <section>
        <GroupHeading>Scheduling</GroupHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            data={{
              key: "google-calendar",
              icon: Calendar,
              iconTone: "bg-muted text-muted-foreground",
              title: "Google Calendar",
              blurb: "Two-way sync so booked appointments show up on your phone.",
              setupTime: "2 min",
              status: "coming_soon",
              actionLabel: "Coming soon",
            }}
          />
          <ConnectionCard
            data={{
              key: "booking",
              icon: Calendar,
              iconTone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              title: "Booking pages",
              blurb: "A public link where leads pick an open slot on your calendar.",
              setupTime: "3 min",
              status: "connected",
              actionLabel: "Manage",
              actionHref: saPath("/booking"),
            }}
          />
        </div>
      </section>

      <section>
        <GroupHeading>Contacts</GroupHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            data={{
              key: "google-contacts",
              icon: Sparkles,
              iconTone: "bg-muted text-muted-foreground",
              title: "Google Contacts",
              blurb: "Bring in your existing contacts automatically.",
              setupTime: "1 min",
              status: "coming_soon",
              actionLabel: "Coming soon",
            }}
          />
          <ConnectionCard
            data={{
              key: "csv-import",
              icon: FileUp,
              iconTone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
              title: "CSV import",
              blurb: "Upload a spreadsheet of contacts from any other tool.",
              setupTime: "2 min",
              status: "connected",
              actionLabel: "Import",
              actionHref: `${contactsHref}?import=1`,
            }}
          />
        </div>
      </section>

      <section>
        <GroupHeading>Lead Capture</GroupHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            data={{
              key: "forms",
              icon: Upload,
              iconTone: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
              title: "Website forms",
              blurb: "A hosted form or iframe embed that creates a contact on submit.",
              setupTime: "2 min",
              status: "connected",
              actionLabel: "Manage",
              actionHref: formsHref,
            }}
          />
          <ConnectionCard
            data={{
              key: "chat-widget",
              icon: MessageSquare,
              iconTone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
              title: "Chat widget",
              blurb: "An AI-answered chat bubble for your website.",
              setupTime: "2 min",
              status: webChatEnabled ? "connected" : "not_connected",
              actionLabel: webChatEnabled ? "Manage" : "Connect",
              actionHref: aiAgentsHref,
            }}
          />
        </div>
      </section>

      <section>
        <GroupHeading>Optional growth</GroupHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <ConnectionCard
            data={{
              key: "idx",
              icon: Building,
              iconTone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
              title: "IDX Broker",
              blurb: "Show live MLS listings on your site and capture buyer leads.",
              setupTime: "5 min",
              status: idxNeedsAttention
                ? "needs_attention"
                : idxConfigured
                  ? "connected"
                  : "not_connected",
              statusDetail: idxNeedsAttention ? "add your access key" : undefined,
              actionLabel: idxConfigured ? "Manage" : "Connect",
              actionHref: idxHref,
            }}
          />
          <ConnectionCard
            data={{
              key: "gbp",
              icon: Sparkles,
              iconTone: "bg-muted text-muted-foreground",
              title: "Google Business Profile",
              blurb: "Reply to reviews and post updates without leaving AgentStack.",
              setupTime: "3 min",
              status: "coming_soon",
              actionLabel: "Coming soon",
            }}
          />
          <ConnectionCard
            data={{
              key: "meta",
              icon: Facebook,
              iconTone: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
              title: "Facebook & Instagram",
              blurb: "Reply to Messenger and Instagram DMs from one inbox.",
              setupTime: "5 min",
              status: metaNeedsAttention
                ? "needs_attention"
                : metaConnected
                  ? "connected"
                  : "not_connected",
              statusDetail: metaNeedsAttention ? "reconnect needed" : undefined,
              actionLabel: metaConnected ? "Manage" : "Connect",
              actionHref: settingsHref,
            }}
          />
        </div>
      </section>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MessagesSquare className="h-3.5 w-3.5" />
        Once connected, replies show up together in Conversations regardless
        of which channel a lead used.
      </p>
    </div>
  );
}

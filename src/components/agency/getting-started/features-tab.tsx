"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  CalendarClock,
  CheckSquare,
  FileSignature,
  FileText,
  GitBranch,
  Globe,
  MessagesSquare,
  Package,
  Search,
  Send,
  Settings,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Sub-account-scoped href under `/sa/{first}/...`, or null for unscoped. */
  href: string | null;
  tone: "indigo" | "violet" | "pink" | "emerald" | "amber" | "sky" | "slate";
  /** Override label on the action button. */
  cta?: string;
  /** When true, no link — just info (e.g. Cmd+K). */
  infoOnly?: boolean;
}

const FEATURES: Feature[] = [
  {
    icon: Users,
    title: "Contacts",
    tone: "indigo",
    href: "/contacts",
    description:
      "Searchable list, individual profiles with notes + a unified activity timeline (calls, emails, form submits, deal moves), CSV import + export.",
  },
  {
    icon: MessagesSquare,
    title: "Conversations",
    tone: "sky",
    href: "/conversations",
    description:
      "Unified inbox across SMS, WhatsApp, and Facebook Messenger / Instagram DMs. One thread per contact with a single reply composer; an unread badge in the sidebar tracks what needs attention. Channels appear as your agency enables them per sub-account.",
  },
  {
    icon: GitBranch,
    title: "Pipeline / Kanban",
    tone: "violet",
    href: "/pipeline",
    description:
      "Six stages from New → Won/Lost. Drag deal cards across columns; each card shows value, stage age, and contact. Lost deals prompt for a reason.",
  },
  {
    icon: Calendar,
    title: "Calendar",
    tone: "pink",
    href: "/calendar",
    description:
      "Month grid with click-to-add events. Optionally link an event to a contact — it shows on their activity timeline automatically.",
  },
  {
    icon: CalendarClock,
    title: "Booking pages",
    tone: "emerald",
    href: "/booking",
    description:
      "Calendly-style slot picker per sub-account, published at /b/[id]/[slug]. A booking reconciles a contact, mints a calendar event, and sends an ICS-attached confirmation. Reschedule, cancel, reminders, and pay-to-confirm holds are all built in.",
  },
  {
    icon: CheckSquare,
    title: "Tasks",
    tone: "amber",
    href: "/tasks",
    description:
      "Filter by Today / Overdue / Upcoming / Done. Due-today badge in the sidebar. Tasks can be linked to contacts so you see them on the profile.",
  },
  {
    icon: FileText,
    title: "Forms",
    tone: "sky",
    href: "/forms",
    description:
      "Drag-order field builder, six field types, public hosted page at /f/[id], iframe embed with appearance controls (theme, accent, hide chrome). Submissions auto-create a contact and optionally a deal.",
  },
  {
    icon: Package,
    title: "Products & Invoices",
    tone: "amber",
    href: "/products",
    description:
      "Reusable product catalog plus an invoice document type. Build line-itemed invoices (or convert an accepted quote in place), send a branded email with a PayPal.me Pay button, and mark paid when the money lands. PDF download on the public page.",
  },
  {
    icon: FileSignature,
    title: "Quotes",
    tone: "sky",
    href: "/quotes",
    description:
      "GHL-style estimates: build a line-itemed quote, send a branded email, and the recipient accepts or declines on a public page. Accept auto-creates a Won-stage deal. Year-prefixed numbering, multi-currency, and full lifecycle tracking (sent → viewed → accepted → paid).",
  },
  {
    icon: Zap,
    title: "Automations",
    tone: "violet",
    href: "/automations",
    description:
      "Workflow Recipes v1 ships Speed-to-Lead: SMS + email + owner notify on form submit. Send-window restrictions, opt-out compliance (HMAC-signed unsubscribe links + Twilio STOP/START), and template merge tags built in.",
  },
  {
    icon: Bot,
    title: "AI Agents",
    tone: "violet",
    href: "/ai-agents",
    description:
      "One persona, every channel. Configure the agent's identity once (system prompt, business hours, escalation keywords) and optionally point at the client's website — Firecrawl scrapes the homepage into a knowledge base the bot uses for replies. Channels: Web Chat (embeddable widget), SMS + WhatsApp (auto-replies on the sub-account's number), Voice (Vapi answers inbound calls), and Outbound Voice (the AI proactively dials a contact or a filtered campaign). Captures create a Contact + a follow-up Task + an escalation email.",
  },
  {
    icon: Send,
    title: "Broadcasts (bulk email)",
    tone: "indigo",
    href: "/broadcasts",
    description:
      "Send a templated email to a filtered audience (all contacts, by tag, or by pipeline stage). Reuses the automation engine + QStash fan-out — opt-out compliance, per-recipient delivery tracking, live status. Capped at 25k recipients per broadcast.",
  },
  {
    icon: Globe,
    title: "Website builder",
    tone: "emerald",
    href: "/website",
    description:
      "Stand up a marketing site for the client via gitpage.site. Sectioned form (Basics / Pages / Services / Business / Design / FAQ), polled async build, live URL in 1–3 minutes. One website per sub-account.",
  },
  {
    icon: BarChart3,
    title: "Reports",
    tone: "indigo",
    href: "/reports",
    description:
      "Date-rangeable KPIs, pipeline funnel, won-revenue area chart, leads-by-source donut. All inline SVG — no chart library.",
  },
  {
    icon: Search,
    title: "Cmd + K search",
    tone: "slate",
    href: null,
    infoOnly: true,
    description:
      "Press ⌘K (Mac) or Ctrl+K (Win) anywhere inside a sub-account to open a global palette across contacts, deals, tasks, events, and forms.",
  },
  {
    icon: Settings,
    title: "Members & invites",
    tone: "pink",
    href: "/dashboard/settings",
    cta: "Open settings",
    description:
      "Invite admins or collaborators per sub-account. Removing a member revokes their access; if it was their only membership they're disabled at the auth layer too.",
  },
];

interface FeaturesTabProps {
  /** First sub-account id from the user's memberships, used to template
   *  /sa/{id}/... links. Null when the user has no memberships yet. */
  firstSubAccountId: string | null;
}

export function FeaturesTab({ firstSubAccountId }: FeaturesTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Each surface, at a glance. Links open in the same tab — use back to
        return.
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {FEATURES.map((f) => (
          <FeatureCard
            key={f.title}
            feature={f}
            firstSubAccountId={firstSubAccountId}
          />
        ))}
      </ul>
    </div>
  );
}

function FeatureCard({
  feature,
  firstSubAccountId,
}: {
  feature: Feature;
  firstSubAccountId: string | null;
}) {
  const Icon = feature.icon;
  const tone = TONE_CLASSES[feature.tone];
  const href =
    !feature.href || feature.infoOnly
      ? null
      : firstSubAccountId
        ? `/sa/${firstSubAccountId}${feature.href}`
        : null;

  return (
    <li className="flex flex-col rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.bg} ${tone.text}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{feature.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {feature.description}
          </p>
        </div>
      </div>
      {feature.infoOnly ? null : (
        <div className="mt-3 flex justify-end">
          {href ? (
            <Button
              size="sm"
              variant="outline"
              render={<Link href={href} />}
            >
              {feature.cta ?? "Open"}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Create a sub-account first
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

const TONE_CLASSES: Record<Feature["tone"], { bg: string; text: string }> = {
  indigo: {
    bg: "bg-indigo-500/10",
    text: "text-indigo-600 dark:text-indigo-400",
  },
  violet: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
  },
  pink: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400" },
  emerald: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  sky: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400" },
  slate: {
    bg: "bg-slate-500/10",
    text: "text-slate-600 dark:text-slate-400",
  },
};

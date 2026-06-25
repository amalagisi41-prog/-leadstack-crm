import {
  Bot,
  Mail,
  MessageCircle,
  MessagesSquare,
  MessageSquare,
  PhoneCall,
  PhoneOutgoing,
  Star,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for the AI Agents channel surface. Every nav
 * tab, every Overview status card, every Coming Soon page reads from
 * this list — adding a future channel means appending one entry and
 * dropping its `comingSoon` flag once shipped.
 */

export type AiChannelId =
  | "overview"
  | "sms"
  | "whatsapp"
  | "voice"
  | "email"
  | "web-chat"
  | "google-business"
  | "outbound";

/** Direction grouping for the nav. Inbound channels (the AI reacts to
 *  someone reaching out) are colored one way; the outbound channel (the
 *  AI proactively calls out) another, so the two are visually distinct. */
export type AiChannelGroup = "inbound" | "outbound";

export interface AiChannel {
  id: AiChannelId;
  label: string;
  /** Used in the Overview cards + ComingSoon hero. */
  blurb: string;
  icon: LucideIcon;
  /** Inbound vs outbound — drives the nav coloring + the Overview grid
   *  (which shows inbound channels only). */
  group: AiChannelGroup;
  /** True when the channel page should render the ComingSoon placeholder
   *  instead of real config. Flip to false when the channel ships. */
  comingSoon: boolean;
  /** When true, the channel is omitted from the nav tabs + Overview grid.
   *  The page route still resolves (renders ComingSoon) if visited
   *  directly. Use this to park channels that aren't a near-term priority
   *  without deleting the work. */
  hidden?: boolean;
  /** When true, the nav tab + status card show a small "beta" marker to
   *  signal the channel is shipped but not a public/GA release yet. */
  beta?: boolean;
  /** URL slug under /sa/{id}/ai-agents/. Empty string for the Overview. */
  slug: string;
}

export const AI_CHANNELS: AiChannel[] = [
  {
    id: "overview",
    label: "Overview",
    blurb: "Status of every AI agent channel on this sub-account.",
    icon: Bot,
    group: "inbound",
    comingSoon: false,
    slug: "",
  },
  {
    id: "web-chat",
    label: "Web Chat",
    blurb:
      "Own-brand chat widget for your website. AI handles inbound, escalates to a human when needed.",
    icon: MessageCircle,
    group: "inbound",
    comingSoon: false,
    slug: "web-chat",
  },
  {
    id: "sms",
    label: "SMS",
    blurb:
      "AI auto-replies to inbound text messages in real time. Per-sub-account persona, business hours, escalation rules.",
    icon: MessageSquare,
    group: "inbound",
    comingSoon: false,
    slug: "sms",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    blurb:
      "AI auto-replies to inbound WhatsApp messages via your Twilio WhatsApp sender. Same persona, business hours, and escalation rules as SMS.",
    icon: MessagesSquare,
    group: "inbound",
    comingSoon: false,
    beta: true,
    slug: "whatsapp",
  },
  {
    id: "voice",
    label: "Voice",
    blurb:
      "AI answers inbound voice calls, qualifies the lead, and books a callback. Same persona as your SMS agent.",
    icon: PhoneCall,
    group: "inbound",
    comingSoon: false,
    slug: "voice",
  },
  {
    id: "outbound",
    label: "Outbound Voice",
    blurb:
      "AI proactively calls your contacts with its own persona — one contact at a time or a whole list. Reuses the Voice channel's number.",
    icon: PhoneOutgoing,
    group: "outbound",
    comingSoon: false,
    slug: "outbound",
  },
  {
    id: "email",
    label: "Email",
    blurb:
      "AI auto-responds to inbound emails using the same brand voice and contact context as SMS.",
    icon: Mail,
    group: "inbound",
    comingSoon: true,
    hidden: true,
    slug: "email",
  },
  {
    id: "google-business",
    label: "Google Business",
    blurb:
      "AI replies to Google Business Profile reviews and Q&A. Keeps your reputation responsive without manual work.",
    icon: Star,
    group: "inbound",
    comingSoon: true,
    hidden: true,
    slug: "google-business",
  },
];

export function getChannel(id: AiChannelId): AiChannel {
  const found = AI_CHANNELS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown AI channel: ${id}`);
  return found;
}

/**
 * The set of channels surfaced in the UI (nav tabs + Overview grid).
 * Hidden channels are filtered out — their pages still exist and resolve
 * if a URL is hit directly, they just don't appear in navigation.
 */
export const VISIBLE_AI_CHANNELS: AiChannel[] = AI_CHANNELS.filter(
  (c) => !c.hidden,
);

export function buildChannelHref(
  subAccountId: string,
  channel: AiChannel,
): string {
  const base = `/sa/${subAccountId}/ai-agents`;
  return channel.slug ? `${base}/${channel.slug}` : base;
}

// Generic global icon for the nav item itself.
export { Bot as AiAgentsIcon };

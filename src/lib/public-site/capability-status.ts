export type CapabilityAvailability = "Live" | "Private Preview" | "Coming Soon";

export interface PublicCapability {
  name: string;
  description: string;
  availability: CapabilityAvailability;
}

export const PUBLIC_CAPABILITIES: readonly PublicCapability[] = [
  {
    name: "People, deals, tasks, and calendar",
    description:
      "The operating workspace for organizing active relationships and opportunities.",
    availability: "Live",
  },
  {
    name: "Lead forms and booking pages",
    description:
      "Public capture pages that create contacts and move leads toward an appointment.",
    availability: "Live",
  },
  {
    name: "Stripe subscription and billing portal",
    description:
      "Secure Solo checkout, trial lifecycle, subscription updates, and cancellation.",
    availability: "Live",
  },
  {
    name: "Guided AgentStack Method setup",
    description:
      "Build, Connect, Capture, Respond, Nurture, and Close in one guided setup.",
    availability: "Live",
  },
  {
    name: "AI Web Chat and AI Assist",
    description:
      "Business-aware conversations, drafts, and guided setup with operator review.",
    availability: "Private Preview",
  },
  {
    name: "AI Website Studio",
    description:
      "Premium templates, editable drafts, migration presets, and a guided AI Designer.",
    availability: "Private Preview",
  },
  {
    name: "SMS and voice automation",
    description:
      "Twilio and Vapi-powered conversations after channel, consent, and compliance setup.",
    availability: "Private Preview",
  },
  {
    name: "IDX listings",
    description:
      "Per-workspace IDX Broker connection and public property search experiences.",
    availability: "Private Preview",
  },
  {
    name: "Social publishing and Meta inbox",
    description:
      "Connected Facebook and Instagram planning, publishing, and conversations.",
    availability: "Private Preview",
  },
  {
    name: "Brokerage and multi-office plans",
    description:
      "Expanded organization controls, routing, reporting, and additional commercial plans.",
    availability: "Coming Soon",
  },
];

export const AVAILABILITY_STYLES: Record<CapabilityAvailability, string> = {
  Live: "bg-emerald-100 text-emerald-800",
  "Private Preview": "bg-amber-100 text-amber-800",
  "Coming Soon": "bg-slate-200 text-slate-700",
};

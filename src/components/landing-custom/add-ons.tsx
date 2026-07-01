import {
  Globe,
  Star,
  MapPin,
  MousePointerClick,
  Share2,
  Sparkles,
  HeadphonesIcon,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface AddOn {
  icon: React.ElementType;
  name: string;
  price: string;
  billing: string;
  description: string;
  bullets: string[];
  badge?: string;
}

const addOns: AddOn[] = [
  {
    icon: Globe,
    name: "Agent Website",
    price: "$49",
    billing: "/mo",
    description:
      "A branded, IDX-ready listing site with built-in lead capture — your digital storefront.",
    bullets: [
      "Custom domain + SSL",
      "Property search with MLS/IDX feed",
      "Neighborhood pages + market reports",
      "Lead capture popups connected to your pipeline",
    ],
  },
  {
    icon: Star,
    name: "Reputation Manager",
    price: "$49",
    billing: "/mo",
    badge: "Most requested",
    description:
      "Automatically collect 5-star reviews after every close — and monitor what buyers are saying about you.",
    bullets: [
      "Auto-request Google + Zillow reviews post-close",
      "Unified dashboard (Google, Zillow, Realtor.com)",
      "Instant alert on any new review",
      "One-click response templates",
    ],
  },
  {
    icon: MapPin,
    name: "Google Business Profile",
    price: "$29",
    billing: "/mo",
    description:
      "Keep your GBP active and ranking — weekly posts, Q&A management, and local SEO tuning.",
    bullets: [
      "3 × weekly Google Posts (listings, market tips, closings)",
      "Q&A monitoring + responses",
      "Photo library updates",
      "Local pack rank tracking",
    ],
  },
  {
    icon: MousePointerClick,
    name: "Google Ads Management",
    price: "$149",
    billing: "/mo",
    description:
      "Managed local search and retargeting campaigns that put you in front of CT buyers at the moment they're searching.",
    bullets: [
      "Campaign setup + keyword research",
      "Ad copy written and A/B tested",
      "Monthly performance report",
      "Ad spend billed separately (we recommend $300–$600/mo)",
    ],
  },
  {
    icon: Share2,
    name: "Social Planner",
    price: "$29",
    billing: "/mo",
    description:
      "Schedule and auto-publish posts to Facebook and Instagram — listings, market updates, and closings.",
    bullets: [
      "Content calendar with drag-and-drop scheduling",
      "AI-generated captions from your listings",
      "Auto-publish to Facebook Page + Instagram",
      "Engagement notifications",
    ],
  },
  {
    icon: Sparkles,
    name: "AI Listing Copy",
    price: "$19",
    billing: "/mo",
    description:
      "Generate polished MLS descriptions, email subject lines, and ad copy in seconds.",
    bullets: [
      "MLS listing descriptions (unlimited)",
      "Email subject line generator",
      "Facebook + Google ad copy",
      "Just listed / just sold social captions",
    ],
  },
  {
    icon: HeadphonesIcon,
    name: "White-Glove Setup",
    price: "$299",
    billing: " one-time",
    description:
      "A dedicated specialist imports your data, configures your automations, and trains your team.",
    bullets: [
      "Contact + deal import from any CRM or CSV",
      "Speed-to-Lead automation configured",
      "AI agent persona written for your brand",
      "2-hour live strategy call",
    ],
  },
];

export function AddOns() {
  return (
    <section id="add-ons" className="bg-muted/30 py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-600">
            Add-ons
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            Build your{" "}
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text font-serif font-normal italic text-transparent">
              perfect stack.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Every plan starts with a full CRM and AI follow-up engine. Add only
            what you need — no bundles, no wasted spend.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {addOns.map((addon) => {
            const Icon = addon.icon;
            return (
              <div
                key={addon.name}
                className="relative flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                {addon.badge && (
                  <span className="absolute -top-3 left-4 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                    {addon.badge}
                  </span>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-foreground">
                      {addon.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {addon.billing}
                    </span>
                  </div>
                </div>

                <h3 className="mt-3 text-base font-semibold text-foreground">
                  {addon.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                  {addon.description}
                </p>

                <ul className="mt-4 flex-1 space-y-2">
                  {addon.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Bundle callout */}
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-[#1a2f50]/20 bg-[#1a2f50]/5 px-6 py-5 sm:flex sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-foreground">
              Stack 3+ add-ons? Save 15%.
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Add any three or more services to your plan and the discount applies automatically.
            </p>
          </div>
          <Button
            render={<Link href="#signup" />}
            className="mt-4 shrink-0 bg-[#1a2f50] text-white hover:bg-[#243d66] sm:mt-0"
            size="sm"
          >
            Start free trial
          </Button>
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface AddOn {
  category: string;
  name: string;
  tagline: string;
  price: string;
  billing: string;
  features: string[];
  badge?: string;
  highlight?: boolean;
}

const addOns: AddOn[] = [
  {
    category: "Visibility",
    name: "AI Website Studio",
    tagline: "AI builds your site from premium templates",
    price: "$99",
    billing: "/mo",
    badge: "New",
    highlight: true,
    features: [
      "Premium templates + an AI Designer that interviews you",
      "Edit your brand & content any time · keep drafts",
      "Build sales funnels + landing pages",
      "Guided A2P registration, chat-widget & SEO setup",
    ],
  },
  {
    category: "Visibility",
    name: "Custom Website Build",
    tagline: "A fully custom site built from scratch",
    price: "$1,500",
    billing: " one-time",
    badge: "Premium",
    features: [
      "Bespoke design — no templates",
      "IDX integration + lead capture wired in",
      "Mobile-first, SEO-optimized build",
      "Handed off to you or hosted on your plan",
    ],
  },
  {
    category: "Reputation",
    name: "Review Manager",
    tagline: "5-star reviews on autopilot",
    price: "$49",
    billing: "/mo",
    badge: "Most requested",
    highlight: true,
    features: [
      "Auto-request Google & Zillow reviews",
      "Unified dashboard across platforms",
      "Instant alert on every new review",
      "One-click response templates",
    ],
  },
  {
    category: "Local SEO",
    name: "Google Business Profile",
    tagline: "Stay active and rank locally",
    price: "$29",
    billing: "/mo",
    features: [
      "3× weekly Google Posts",
      "Q&A monitoring & responses",
      "Photo library updates",
      "Local pack rank tracking",
    ],
  },
  {
    category: "Paid Ads",
    name: "Google Ads Management",
    tagline: "Managed campaigns that convert",
    price: "$149",
    billing: "/mo",
    features: [
      "Campaign setup & keyword research",
      "Ad copy written & A/B tested",
      "Monthly performance report",
      "Ad spend billed separately",
    ],
  },
  {
    category: "Visibility",
    name: "IDX Listings",
    tagline: "A live, searchable MLS listings site — powered by your own IDX Broker account",
    price: "$49",
    billing: "/mo",
    features: [
      "Branded public listings search + detail pages",
      "Auto-synced from your IDX Broker account every 6 hours",
      "Every listing view captures a lead straight into your CRM",
      "\"Request a showing\" form on every listing",
    ],
  },
  {
    category: "Social",
    name: "Social Planner",
    tagline: "Schedule once, publish everywhere",
    price: "$29",
    billing: "/mo",
    features: [
      "Drag-and-drop content calendar",
      "AI captions from your listings",
      "Auto-publish to Facebook & Instagram",
      "Engagement notifications",
    ],
  },
  {
    category: "Content",
    name: "AI Listing Copy",
    tagline: "Polished copy in seconds",
    price: "$19",
    billing: "/mo",
    features: [
      "Unlimited MLS descriptions",
      "Email subject line generator",
      "Facebook & Google ad copy",
      "Just listed / just sold captions",
    ],
  },
  {
    category: "Onboarding",
    name: "White-Glove Setup",
    tagline: "Our team configures everything for you",
    price: "$299",
    billing: " one-time",
    features: [
      "We import your contacts from any system or CSV",
      "Speed-to-Lead automations built & tested",
      "AI agent persona written for your brand",
      "2-hour live onboarding call with your team",
    ],
  },
];

const categoryColors: Record<string, string> = {
  Visibility: "bg-sky-500",
  Reputation: "bg-amber-500",
  "Local SEO": "bg-emerald-500",
  "Paid Ads": "bg-orange-500",
  Social: "bg-violet-500",
  Content: "bg-blue-500",
  Onboarding: "bg-rose-500",
};

export function AddOns() {
  return (
    <section id="add-ons" className="py-24">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-600">
            Add-ons
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            Build the stack{" "}
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text font-sans font-normal italic text-transparent">
              you actually need.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Every plan starts with the full operating system and AI follow-up engine.
            Layer on only the services that match your business — no bundles, no bloat.
          </p>
        </div>

        {/* Cards */}
        <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {addOns.map((addon) => {
            const dot = categoryColors[addon.category] ?? "bg-blue-500";
            return (
              <div
                key={addon.name}
                className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  addon.highlight
                    ? "border-[#1a2f50]/30 ring-1 ring-[#1a2f50]/20"
                    : "border-border"
                }`}
              >
                {/* Badge */}
                {addon.badge && (
                  <span className="absolute -top-3 left-5 rounded-full bg-amber-500 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                    {addon.badge}
                  </span>
                )}

                {/* Category pill */}
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {addon.category}
                  </span>
                </div>

                {/* Name + tagline */}
                <h3 className="mt-3 text-lg font-semibold leading-tight text-foreground">
                  {addon.name}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {addon.tagline}
                </p>

                {/* Price */}
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-foreground">
                    {addon.price}
                  </span>
                  <span className="text-sm text-muted-foreground">{addon.billing}</span>
                </div>

                {/* Divider */}
                <div className="my-4 border-t border-border" />

                {/* Feature list */}
                <ul className="flex-1 space-y-2.5">
                  {addon.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/80">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-blue-500"
                        fill="none"
                        viewBox="0 0 16 16"
                      >
                        <circle cx="8" cy="8" r="7" className="fill-blue-50" />
                        <path
                          d="M5 8.5l2 2 4-4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Bundle banner */}
        <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-2xl bg-[#1a2f50]">
          <div className="flex flex-col items-center gap-4 px-8 py-7 text-center sm:flex-row sm:text-left">
            <div className="flex-1">
              <p className="text-lg font-semibold text-white">
                Stack 3 or more add-ons — save 15%.
              </p>
              <p className="mt-1 text-sm text-blue-200/70">
                The discount applies automatically when you add any three or more services to your plan.
              </p>
            </div>
            <Button
              render={<Link href="#signup" />}
              className="shrink-0 bg-white text-[#1a2f50] hover:bg-blue-50 font-semibold"
              size="sm"
            >
              Get started
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

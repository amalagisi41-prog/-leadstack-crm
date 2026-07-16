import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MARKETING_ADD_ON_NAMES } from "@/config/landing";

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
    name: MARKETING_ADD_ON_NAMES.aiWebsiteStudio,
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
    name: MARKETING_ADD_ON_NAMES.customWebsiteBuild,
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
    name: MARKETING_ADD_ON_NAMES.reviewManager,
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
    name: MARKETING_ADD_ON_NAMES.googleBusinessProfile,
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
    name: MARKETING_ADD_ON_NAMES.googleAdsManagement,
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
    category: "Social",
    name: MARKETING_ADD_ON_NAMES.socialPlanner,
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
    name: MARKETING_ADD_ON_NAMES.aiListingCopy,
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
    name: MARKETING_ADD_ON_NAMES.whiteGloveSetup,
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
    <section id="add-ons" className="bg-[#FFF8EF] py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
            Add-ons
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
            Build the stack{" "}
            <span className="font-sans font-normal italic text-[#DB4F9B]">
              you actually need.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#526078] sm:text-lg">
            Every plan starts with the full operating system and AI follow-up engine.
            Layer on only the services that match your business — no bundles, no bloat.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {addOns.map((addon) => {
            const dot = categoryColors[addon.category] ?? "bg-blue-500";
            return (
              <div
                key={addon.name}
                className={`relative flex flex-col rounded-[1.75rem] border p-6 shadow-[0_14px_40px_rgba(23,59,122,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_55px_rgba(23,59,122,0.10)] ${
                  addon.highlight
                    ? "border-[#173B7A]/20 bg-white ring-1 ring-[#173B7A]/10"
                    : "border-[#E7DCC7] bg-[#FFFDFC]"
                }`}
              >
                {addon.badge && (
                  <span className="absolute -top-3 left-5 rounded-full bg-[#DB4F9B] px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                    {addon.badge}
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-[#7B8AA1]">
                    {addon.category}
                  </span>
                </div>

                <h3 className="mt-3 text-lg font-semibold leading-tight text-[#173B7A]">
                  {addon.name}
                </h3>
                <p className="mt-0.5 text-sm leading-6 text-[#526078]">
                  {addon.tagline}
                </p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight text-[#173B7A]">
                    {addon.price}
                  </span>
                  <span className="text-sm text-[#7B8AA1]">{addon.billing}</span>
                </div>

                <div className="my-5 border-t border-[#EFE4D3]" />

                <ul className="flex-1 space-y-2.5">
                  {addon.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm leading-6 text-[#173B7A]/85">
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#4F91FF]"
                        fill="none"
                        viewBox="0 0 16 16"
                      >
                        <circle cx="8" cy="8" r="7" className="fill-[#EEF4FF]" />
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

        <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-[2rem] border border-[#E7DCC7] bg-[#FFFDFC] shadow-[0_18px_50px_rgba(23,59,122,0.06)]">
          <div className="flex flex-col items-center gap-5 px-8 py-8 text-center sm:flex-row sm:text-left">
            <div className="flex-1">
              <p className="text-lg font-semibold text-[#173B7A] sm:text-xl">
                Stack 3 or more add-ons — save 15%.
              </p>
              <p className="mt-1 text-sm leading-6 text-[#526078]">
                The discount applies automatically when you add any three or more services to your plan.
              </p>
            </div>
            <Button
              render={<Link href="#signup" />}
              className="shrink-0 bg-[#173B7A] font-semibold text-white hover:bg-[#214b95]"
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

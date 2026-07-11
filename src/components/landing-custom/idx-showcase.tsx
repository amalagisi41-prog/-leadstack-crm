import Link from "next/link";
import { Home, BedDouble, Bath, MapPin, Heart, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HousePalette {
  skyTop: string;
  skyBottom: string;
  ground: string;
  house: string;
  roof: string;
  door: string;
  tree: string;
}

type Status = "Active" | "Pending" | "New";

const listings: {
  price: string;
  beds: number;
  baths: number;
  addr: string;
  status: Status;
  tag?: string;
  palette: HousePalette;
}[] = [
  {
    price: "$489,000",
    beds: 3,
    baths: 2,
    addr: "47 Elmwood Ave",
    status: "Active",
    tag: "Virtual Tour",
    palette: { skyTop: "#DBEAFE", skyBottom: "#EFF6FF", ground: "#C7DFC0", house: "#F8FAFC", roof: "#4338CA", door: "#3730A3", tree: "#4D8C57" },
  },
  {
    price: "$612,500",
    beds: 4,
    baths: 3,
    addr: "22 Maple St",
    status: "Pending",
    palette: { skyTop: "#FBE7F3", skyBottom: "#FDF2F8", ground: "#CBE3C4", house: "#FDF4FF", roof: "#BE185D", door: "#9D174D", tree: "#4D8C57" },
  },
  {
    price: "$358,900",
    beds: 2,
    baths: 1,
    addr: "9 Birchwood Ln",
    status: "New",
    palette: { skyTop: "#CCFBF1", skyBottom: "#ECFEFF", ground: "#C4E4CB", house: "#F0FDFA", roof: "#0F766E", door: "#115E59", tree: "#4D8C57" },
  },
  {
    price: "$725,000",
    beds: 5,
    baths: 4,
    addr: "104 Ridgeview Dr",
    status: "Active",
    tag: "Open House",
    palette: { skyTop: "#FDECC8", skyBottom: "#FFF7ED", ground: "#D8E4B8", house: "#FFFBEB", roof: "#C2410C", door: "#9A3412", tree: "#4D8C57" },
  },
];

const statusStyles: Record<Status, string> = {
  Active: "bg-blue-600 text-white",
  Pending: "bg-slate-700 text-white",
  New: "bg-emerald-600 text-white",
};

const filters = ["Price", "Beds", "Baths", "More"];

const mapPins = [
  { x: 28, y: 30, price: "$489k" },
  { x: 62, y: 22, price: null },
  { x: 78, y: 48, price: "$612k" },
  { x: 40, y: 58, price: null },
  { x: 55, y: 72, price: null },
  { x: 20, y: 68, price: null },
];

function MapPanel() {
  return (
    <div className="relative hidden h-full min-h-[150px] w-full overflow-hidden rounded-md bg-[#E4ECE0] sm:block">
      <svg viewBox="0 0 100 90" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
        <rect width="100" height="90" fill="#E4ECE0" />
        <path d="M0,20 Q30,10 55,25 T100,15" stroke="#F5F1E6" strokeWidth="2.5" fill="none" />
        <path d="M0,55 Q35,45 60,60 T100,50" stroke="#F5F1E6" strokeWidth="2.5" fill="none" />
        <path d="M15,0 Q25,40 20,90" stroke="#F5F1E6" strokeWidth="2" fill="none" />
        <path d="M70,0 Q75,45 80,90" stroke="#F5F1E6" strokeWidth="2" fill="none" />
        <circle cx="18" cy="12" r="7" fill="#CFE0C6" />
        <circle cx="85" cy="70" r="10" fill="#CFE0C6" />
      </svg>
      {mapPins.map((p, i) => (
        <div
          key={i}
          className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        >
          {p.price && (
            <span className="mb-0.5 rounded bg-[#1a2540] px-1 py-[1px] text-[6px] font-bold text-white shadow-sm">
              {p.price}
            </span>
          )}
          <svg width="10" height="13" viewBox="0 0 10 13" fill="none">
            <path
              d="M5 13C5 13 10 7.5 10 4.6C10 2.06 7.76 0 5 0C2.24 0 0 2.06 0 4.6C0 7.5 5 13 5 13Z"
              fill={p.price ? "#1a2540" : "#4F91FF"}
            />
            <circle cx="5" cy="4.6" r="1.8" fill="white" />
          </svg>
        </div>
      ))}
    </div>
  );
}

function HouseThumb({ palette, uid }: { palette: HousePalette; uid: string }) {
  const skyId = `idx-sky-${uid}`;
  return (
    <svg
      viewBox="0 0 120 90"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.skyTop} />
          <stop offset="100%" stopColor={palette.skyBottom} />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill={`url(#${skyId})`} />
      <rect x="0" y="70" width="120" height="20" fill={palette.ground} />
      {/* driveway */}
      <polygon points="88,90 108,90 100,70 90,70" fill="#D6D3C9" />
      {/* tree */}
      <rect x="8" y="52" width="4" height="18" fill="#8B5E3C" />
      <circle cx="10" cy="48" r="11" fill={palette.tree} />
      <circle cx="4" cy="52" r="7" fill={palette.tree} opacity="0.85" />
      {/* roof + house body */}
      <polygon points="28,44 62,18 96,44" fill={palette.roof} />
      <rect x="34" y="44" width="56" height="26" fill={palette.house} stroke={palette.roof} strokeWidth="1" />
      {/* garage */}
      <rect x="80" y="52" width="16" height="18" fill={palette.house} stroke={palette.roof} strokeWidth="1" />
      <rect x="82" y="55" width="12" height="13" fill={palette.ground} stroke={palette.roof} strokeWidth="0.75" />
      {/* door */}
      <rect x="55" y="53" width="10" height="17" rx="1" fill={palette.door} />
      {/* windows */}
      <rect x="39" y="49" width="12" height="12" rx="1.5" fill="white" stroke={palette.roof} strokeWidth="1.5" />
      <line x1="45" y1="49" x2="45" y2="61" stroke={palette.roof} strokeWidth="0.75" />
      <line x1="39" y1="55" x2="51" y2="55" stroke={palette.roof} strokeWidth="0.75" />
      <rect x="70" y="49" width="12" height="12" rx="1.5" fill="white" stroke={palette.roof} strokeWidth="1.5" />
      <line x1="76" y1="49" x2="76" y2="61" stroke={palette.roof} strokeWidth="0.75" />
      <line x1="70" y1="55" x2="82" y2="55" stroke={palette.roof} strokeWidth="0.75" />
    </svg>
  );
}

function ListingCard({
  listing,
  uid,
  compact,
}: {
  listing: (typeof listings)[number];
  uid: string;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className={compact ? "relative h-14" : "relative h-16 sm:h-20"}>
        <HouseThumb palette={listing.palette} uid={uid} />
        <div className="absolute left-1 top-1 flex flex-wrap gap-0.5">
          <span className={`rounded px-1 py-[1px] text-[6px] font-bold uppercase tracking-wide ${statusStyles[listing.status]}`}>
            {listing.status}
          </span>
          {listing.tag && !compact && (
            <span className="rounded bg-black/55 px-1 py-[1px] text-[6px] font-semibold text-white">
              {listing.tag}
            </span>
          )}
        </div>
        <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/90 shadow-sm">
          <Heart className="h-2 w-2 text-slate-500" />
        </span>
      </div>
      <div className="p-1.5 sm:p-2">
        <p className="text-[10px] font-bold sm:text-[11px]">{listing.price}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[8px] text-muted-foreground sm:text-[9px]">
          <span className="flex items-center gap-0.5">
            <BedDouble className="h-2 w-2" /> {listing.beds}
          </span>
          <span className="flex items-center gap-0.5">
            <Bath className="h-2 w-2" /> {listing.baths}
          </span>
        </div>
        {!compact && (
          <p className="mt-0.5 flex items-center gap-0.5 truncate text-[8px] text-muted-foreground sm:text-[9px]">
            <MapPin className="h-2 w-2 shrink-0" /> {listing.addr}
          </p>
        )}
      </div>
    </div>
  );
}

export function IdxShowcase() {
  return (
    <section className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 mb-2">
            IDX Listings
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-4xl">
            Your own listings site,{" "}
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text font-sans font-normal italic text-transparent">
              live on your laptop and their phone.
            </span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Connect your IDX Broker account once. Every listing search, on any device, feeds leads straight into your CRM.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.35fr_1fr]">
          {/* Device mockups */}
          <div className="relative mx-auto w-full max-w-xl pb-12 pl-8 sm:pb-16 sm:pl-14">
            {/* Laptop */}
            <div className="rounded-t-xl border-4 border-b-0 border-[#1a2540] bg-[#1a2540] p-1.5 shadow-2xl">
              <div className="overflow-hidden rounded-md bg-background">
                <div className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
                  <div className="h-2 w-2 rounded-full bg-red-400/70" />
                  <div className="h-2 w-2 rounded-full bg-yellow-400/70" />
                  <div className="h-2 w-2 rounded-full bg-green-400/70" />
                  <span className="ml-2 truncate rounded bg-background px-2 py-0.5 text-[9px] text-muted-foreground">
                    yourbrand.com/listings
                  </span>
                </div>

                {/* Filter bar */}
                <div className="flex items-center gap-1 border-b px-3 py-1.5">
                  <span className="flex items-center gap-1 rounded border bg-background px-1.5 py-1 text-[7px] text-muted-foreground">
                    <Search className="h-2 w-2" /> Area, City, ZIP
                  </span>
                  {filters.map((f) => (
                    <span key={f} className="hidden rounded border px-1.5 py-1 text-[7px] text-muted-foreground sm:inline-block">
                      {f} ▾
                    </span>
                  ))}
                  <span className="ml-auto shrink-0 rounded bg-[#1a2540] px-1.5 py-1 text-[7px] font-semibold text-white">
                    Save Search
                  </span>
                </div>

                <div className="flex items-center justify-between px-3 pt-2">
                  <span className="text-[9px] font-bold uppercase tracking-wide sm:text-[10px]">Featured Listings</span>
                  <span className="text-[8px] font-medium text-blue-500 sm:text-[9px]">View All</span>
                </div>

                {/* Map + listings split */}
                <div className="grid grid-cols-1 gap-2 p-2.5 sm:grid-cols-2 sm:p-3">
                  <MapPanel />
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    {listings.map((l, i) => (
                      <ListingCard key={l.addr} listing={l} uid={`lap-${i}`} compact />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {/* Laptop base */}
            <div className="ml-auto h-3 w-full max-w-[30rem] rounded-b-xl bg-gradient-to-b from-[#2a3f5f] to-[#1a2540]" />

            {/* Phone standing in front, overlapping the laptop's bottom-left
                corner (mirrors the composition realtors' IDX vendors use:
                phone in front, laptop behind). Fixed 9:19.5 aspect ratio +
                notch + home indicator so it actually reads as a phone body. */}
            <div className="absolute -bottom-4 left-0 z-10 w-28 sm:-bottom-6 sm:w-36">
              <div className="rounded-[2rem] border-[5px] border-[#1a2540] bg-[#1a2540] shadow-2xl">
                <div
                  className="relative overflow-hidden rounded-[1.5rem] bg-background"
                  style={{ aspectRatio: "9 / 19.5" }}
                >
                  <div className="absolute left-1/2 top-0 z-10 h-3 w-12 -translate-x-1/2 rounded-b-lg bg-[#1a2540]" />
                  <div className="flex h-full flex-col pt-4">
                    <div className="flex items-center justify-between px-2 pb-1">
                      <Home className="h-2.5 w-2.5 text-blue-500" />
                      <span className="text-[7px] font-bold uppercase tracking-wide text-muted-foreground">Featured Listings</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 overflow-hidden px-1.5">
                      {listings.slice(0, 2).map((l, i) => (
                        <ListingCard key={l.addr} listing={l} uid={`ph-${i}`} />
                      ))}
                    </div>
                  </div>
                  <div className="absolute bottom-1.5 left-1/2 h-[3px] w-9 -translate-x-1/2 rounded-full bg-foreground/25" />
                </div>
              </div>
            </div>
          </div>

          {/* Copy */}
          <div>
            <ul className="space-y-3">
              {[
                "Branded search + detail pages — your logo, your domain",
                "Auto-synced from your IDX Broker account every 6 hours",
                "Every listing view captures a lead straight into your CRM",
                "\"Request a showing\" form on every listing, no extra setup",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-600">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Button render={<Link href="#add-ons" />} size="lg" className="px-6">
                See IDX pricing
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

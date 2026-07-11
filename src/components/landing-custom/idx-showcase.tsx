import Link from "next/link";
import { Home, BedDouble, Bath, MapPin, Heart } from "lucide-react";
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
}: {
  listing: (typeof listings)[number];
  uid: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="relative h-16 sm:h-24">
        <HouseThumb palette={listing.palette} uid={uid} />
        <div className="absolute left-1 top-1 flex flex-wrap gap-0.5">
          <span className={`rounded px-1 py-[1px] text-[6px] font-bold uppercase tracking-wide sm:text-[7px] ${statusStyles[listing.status]}`}>
            {listing.status}
          </span>
          {listing.tag && (
            <span className="rounded bg-black/55 px-1 py-[1px] text-[6px] font-semibold text-white sm:text-[7px]">
              {listing.tag}
            </span>
          )}
        </div>
        <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/90 shadow-sm sm:h-4 sm:w-4">
          <Heart className="h-2 w-2 text-slate-500 sm:h-2.5 sm:w-2.5" />
        </span>
      </div>
      <div className="p-2 sm:p-2.5">
        <p className="text-[11px] font-bold sm:text-sm">{listing.price}</p>
        <div className="mt-1 flex items-center gap-2 text-[9px] text-muted-foreground sm:text-[10px]">
          <span className="flex items-center gap-0.5">
            <BedDouble className="h-2.5 w-2.5" /> {listing.beds}
          </span>
          <span className="flex items-center gap-0.5">
            <Bath className="h-2.5 w-2.5" /> {listing.baths}
          </span>
        </div>
        <p className="mt-0.5 flex items-center gap-0.5 truncate text-[9px] text-muted-foreground sm:text-[10px]">
          <MapPin className="h-2.5 w-2.5 shrink-0" /> {listing.addr}
        </p>
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

        <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
          {/* Device mockups */}
          <div className="relative mx-auto w-full max-w-md">
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
                <div className="flex items-center justify-between px-3 pt-2.5">
                  <span className="text-[10px] font-semibold sm:text-xs">Featured Listings</span>
                  <span className="text-[9px] font-medium text-blue-500">View All</span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  {listings.map((l, i) => (
                    <ListingCard key={l.addr} listing={l} uid={`lap-${i}`} />
                  ))}
                </div>
              </div>
            </div>
            {/* Laptop base */}
            <div className="mx-auto h-3 w-[104%] max-w-[26rem] -translate-x-[2%] rounded-b-xl bg-gradient-to-b from-[#2a3f5f] to-[#1a2540]" />

            {/* Phone, overlapping bottom-right */}
            <div className="absolute -bottom-8 -right-4 w-28 rounded-[1.4rem] border-4 border-[#1a2540] bg-[#1a2540] p-1 shadow-2xl sm:w-32">
              <div className="overflow-hidden rounded-[1rem] bg-background">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <Home className="h-2.5 w-2.5 text-blue-500" />
                  <span className="text-[7px] font-semibold text-muted-foreground">Listings</span>
                </div>
                <div className="flex flex-col gap-1.5 px-1.5 pb-2">
                  {listings.slice(0, 2).map((l, i) => (
                    <ListingCard key={l.addr} listing={l} uid={`ph-${i}`} />
                  ))}
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

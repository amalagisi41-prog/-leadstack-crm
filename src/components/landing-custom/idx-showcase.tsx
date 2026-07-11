import Link from "next/link";
import { Home, BedDouble, Bath, MapPin } from "lucide-react";
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

const listings: {
  price: string;
  beds: number;
  baths: number;
  addr: string;
  palette: HousePalette;
}[] = [
  {
    price: "$489,000",
    beds: 3,
    baths: 2,
    addr: "47 Elmwood Ave",
    palette: { skyTop: "#DBEAFE", skyBottom: "#EFF6FF", ground: "#C7DFC0", house: "#F8FAFC", roof: "#4338CA", door: "#3730A3", tree: "#4D8C57" },
  },
  {
    price: "$612,500",
    beds: 4,
    baths: 3,
    addr: "22 Maple St",
    palette: { skyTop: "#FBE7F3", skyBottom: "#FDF2F8", ground: "#CBE3C4", house: "#FDF4FF", roof: "#BE185D", door: "#9D174D", tree: "#4D8C57" },
  },
  {
    price: "$358,900",
    beds: 2,
    baths: 1,
    addr: "9 Birchwood Ln",
    palette: { skyTop: "#CCFBF1", skyBottom: "#ECFEFF", ground: "#C4E4CB", house: "#F0FDFA", roof: "#0F766E", door: "#115E59", tree: "#4D8C57" },
  },
  {
    price: "$725,000",
    beds: 5,
    baths: 4,
    addr: "104 Ridgeview Dr",
    palette: { skyTop: "#FDECC8", skyBottom: "#FFF7ED", ground: "#D8E4B8", house: "#FFFBEB", roof: "#C2410C", door: "#9A3412", tree: "#4D8C57" },
  },
];

function HouseThumb({ palette, uid }: { palette: HousePalette; uid: string }) {
  const skyId = `idx-sky-${uid}`;
  return (
    <svg
      viewBox="0 0 120 80"
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
      <rect width="120" height="80" fill={`url(#${skyId})`} />
      <rect x="0" y="62" width="120" height="18" fill={palette.ground} />
      <rect x="8" y="46" width="4" height="16" fill="#8B5E3C" />
      <circle cx="10" cy="42" r="10" fill={palette.tree} />
      <polygon points="30,38 62,15 95,38" fill={palette.roof} />
      <rect x="35" y="38" width="55" height="30" fill={palette.house} stroke={palette.roof} strokeWidth="1" />
      <rect x="72" y="51" width="11" height="17" rx="1" fill={palette.door} />
      <rect x="42" y="45" width="13" height="13" rx="1.5" fill="white" stroke={palette.roof} strokeWidth="1.5" />
      <line x1="48.5" y1="45" x2="48.5" y2="58" stroke={palette.roof} strokeWidth="0.75" />
      <line x1="42" y1="51.5" x2="55" y2="51.5" stroke={palette.roof} strokeWidth="0.75" />
      <rect x="60" y="45" width="13" height="13" rx="1.5" fill="white" stroke={palette.roof} strokeWidth="1.5" />
      <line x1="66.5" y1="45" x2="66.5" y2="58" stroke={palette.roof} strokeWidth="0.75" />
      <line x1="60" y1="51.5" x2="73" y2="51.5" stroke={palette.roof} strokeWidth="0.75" />
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
      <div className="h-14 sm:h-20">
        <HouseThumb palette={listing.palette} uid={uid} />
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

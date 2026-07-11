import Link from "next/link";
import { Home, BedDouble, Bath, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

const listings = [
  { price: "$489,000", beds: 3, baths: 2, addr: "47 Elmwood Ave", tone: "from-blue-400 to-indigo-500" },
  { price: "$612,500", beds: 4, baths: 3, addr: "22 Maple St", tone: "from-purple-400 to-pink-500" },
  { price: "$358,900", beds: 2, baths: 1, addr: "9 Birchwood Ln", tone: "from-teal-400 to-blue-500" },
  { price: "$725,000", beds: 5, baths: 4, addr: "104 Ridgeview Dr", tone: "from-amber-400 to-orange-500" },
];

function ListingCard({ listing }: { listing: (typeof listings)[number] }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className={`h-14 bg-gradient-to-br ${listing.tone} sm:h-20`} />
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
                  {listings.map((l) => (
                    <ListingCard key={l.addr} listing={l} />
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
                  {listings.slice(0, 2).map((l) => (
                    <ListingCard key={l.addr} listing={l} />
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

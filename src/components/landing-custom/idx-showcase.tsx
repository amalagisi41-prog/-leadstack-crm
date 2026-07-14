import Image from "next/image";
import styles from "./idx-showcase.module.css";

type Status = "active" | "pending" | "new";

interface Listing {
  photoUrl: string;
  alt: string;
  status: Status;
  photoCount: number;
  price: string;
  beds: number;
  baths: number;
  sqft: string;
  address: string;
  agent: string;
  brokerage: string;
}

const listings: Listing[] = [
  {
    photoUrl: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
    alt: "Modern two-story home at dusk — 47 Elmwood Ave",
    status: "active",
    photoCount: 24,
    price: "$489,000",
    beds: 3,
    baths: 2,
    sqft: "1,840",
    address: "47 Elmwood Ave, Maplewood, NJ 07040",
    agent: "A. Bianchi",
    brokerage: "Elm & Main Realty",
  },
  {
    photoUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
    alt: "Contemporary home — 22 Maple St",
    status: "pending",
    photoCount: 18,
    price: "$612,500",
    beds: 4,
    baths: 3,
    sqft: "2,410",
    address: "22 Maple St, South Orange, NJ 07079",
    agent: "M. Rossi",
    brokerage: "Harbor Lane Group",
  },
  {
    photoUrl: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=800&q=80",
    alt: "Classic white home — 9 Birchwood Ln",
    status: "new",
    photoCount: 31,
    price: "$358,900",
    beds: 2,
    baths: 1,
    sqft: "1,120",
    address: "9 Birchwood Ln, Maplewood, NJ 07040",
    agent: "S. Grant",
    brokerage: "Northside Realty",
  },
  {
    photoUrl: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
    alt: "Luxury home with pool at dusk — 104 Ridgeview Dr",
    status: "active",
    photoCount: 42,
    price: "$725,000",
    beds: 5,
    baths: 4,
    sqft: "3,260",
    address: "104 Ridgeview Dr, Montclair, NJ 07042",
    agent: "J. Alvarez",
    brokerage: "Summit West RE",
  },
];

const pillClass: Record<Status, string> = {
  active: styles.pillActive,
  pending: styles.pillPending,
  new: styles.pillNew,
};
const pillLabel: Record<Status, string> = {
  active: "Active",
  pending: "Pending",
  new: "New",
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <path d="m1 1 4 4 4-4" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 8h3l2-3h6l2 3h3v12H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" />
    </svg>
  );
}

function HouseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 11 12 4l9 7v9h-6v-6h-6v6H3z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 18 12" fill="#101A3C">
      <rect x="0" y="7" width="3" height="5" rx="1" />
      <rect x="5" y="5" width="3" height="7" rx="1" />
      <rect x="10" y="2.5" width="3" height="9.5" rx="1" />
      <rect x="15" y="0" width="3" height="12" rx="1" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 16 12" fill="none" stroke="#101A3C" strokeWidth={1.8} strokeLinecap="round">
      <path d="M1.5 4.5a10 10 0 0 1 13 0M4 7.2a6.5 6.5 0 0 1 8 0M6.6 9.8a3 3 0 0 1 2.8 0" />
      <circle cx="8" cy="11" r="0.9" fill="#101A3C" stroke="none" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg viewBox="0 0 25 12" fill="none">
      <rect x="0.8" y="0.8" width="20" height="10.4" rx="3" stroke="#101A3C" strokeWidth={1.2} />
      <rect x="2.6" y="2.6" width="14" height="6.8" rx="1.6" fill="#101A3C" />
      <path d="M22.6 4v4a2.2 2.2 0 0 0 0-4z" fill="#101A3C" />
    </svg>
  );
}

function MapFabIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
    </svg>
  );
}

const mapPins: { x: number; y: number; w: number; price: string; brand?: boolean }[] = [
  { x: 30, y: 132, w: 44, price: "$612K" },
  { x: 96, y: 96, w: 44, price: "$845K" },
  { x: 158, y: 128, w: 44, price: "$1.2M" },
  { x: 56, y: 188, w: 44, price: "$489K", brand: true },
  { x: 132, y: 200, w: 44, price: "$725K" },
  { x: 34, y: 286, w: 44, price: "$359K" },
  { x: 120, y: 300, w: 44, price: "$560K" },
  { x: 168, y: 252, w: 44, price: "$930K" },
  { x: 72, y: 398, w: 44, price: "$1.4M" },
  { x: 156, y: 416, w: 44, price: "$675K" },
];

function ListingCard({
  listing,
  sizes,
  large,
}: {
  listing: Listing;
  sizes: string;
  large?: boolean;
}) {
  return (
    <article className={large ? `${styles.card} ${styles.cardLg}` : styles.card}>
      <div className={styles.photo}>
        <Image src={listing.photoUrl} alt={listing.alt} fill sizes={sizes} style={{ objectFit: "cover" }} />
        <span className={`${styles.pill} ${pillClass[listing.status]}`}>{pillLabel[listing.status]}</span>
        <span className={styles.count}>
          <CameraIcon />
          {listing.photoCount}
        </span>
        <span className={styles.fav}>
          <HeartIcon />
        </span>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.price}>{listing.price}</div>
        <div className={styles.meta}>
          {listing.beds} beds <i>|</i> {listing.baths} baths <i>|</i> {listing.sqft} SqFt
        </div>
        <div className={styles.addr}>{listing.address}</div>
        <div className={styles.listedby}>
          <span>
            Listed by {listing.agent} · {listing.brokerage}
          </span>
          <span className={styles.mls}>
            <HouseIcon />
            MLS
          </span>
        </div>
      </div>
    </article>
  );
}

const benefits = [
  { strong: "Branded search + detail pages", rest: "— your logo, your domain" },
  { strong: "Auto-synced", rest: "from your IDX Broker account every 6 hours" },
  { strong: "Every listing view captures a lead", rest: "straight into your CRM" },
  { strong: "“Request a showing” form", rest: "on every listing, no extra setup" },
];

const idxSteps = [
  {
    n: "1",
    title: "Sign up with IDX Broker",
    body: "Already have an account? Skip to step 2.",
    cta: "Sign up with IDX",
  },
  {
    n: "2",
    title: "Connect your key",
    body: "Paste it into AgentStack — takes about 2 minutes.",
  },
  {
    n: "3",
    title: "Go live",
    body: "Or skip the setup entirely — we'll do it for you.",
  },
];

export function IdxShowcase() {
  return (
    <section className={styles.idx} id="idx-listings">
      <div className={styles.idxInner}>
        <div className={styles.idxHead}>
          <div className={styles.idxEyebrow}>
            <span className={styles.dot} />
            IDX Listings
          </div>
          <h2>
            Your own listings site, <em>live on your laptop and their phone.</em>
          </h2>
          <p>
            Sign up with IDX Broker, connect your key, and you&apos;re live — or skip the setup
            and let us do it for you.
          </p>
        </div>

        <div className={styles.idxSteps}>
          {idxSteps.map((s) => (
            <div className={styles.idxStep} key={s.n}>
              <span className={styles.idxStepNum}>{s.n}</span>
              <div>
                <p className={styles.idxStepTitle}>{s.title}</p>
                <p className={styles.idxStepBody}>{s.body}</p>
                {s.cta ? (
                  <div className={styles.idxStepCta}>
                    <span className={styles.idxBrandMark}>IDX Broker</span>
                    <span className={styles.idxCtaLink}>{s.cta} →</span>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.idxGrid}>
          {/* Device composite */}
          <div className={styles.device}>
            <div className={styles.toast} role="status">
              <span className={styles.sig} />
              <div>
                <b>New lead captured</b>
                <small>47 Elmwood Ave · synced to CRM</small>
              </div>
            </div>

            {/* MacBook */}
            <div className={styles.laptop}>
              <div className={styles.lid}>
                <span className={styles.cam} />
                <div className={styles.screen}>
                  <div className={styles.topbar}>
                    <div className={styles.searchbox}>
                      <SearchIcon />
                      Area, City, ZIP, School…
                    </div>
                    <span className={styles.chip}>
                      Price <ChevronDownIcon />
                    </span>
                    <span className={styles.chip}>
                      Beds <ChevronDownIcon />
                    </span>
                    <span className={styles.chip}>
                      Baths <ChevronDownIcon />
                    </span>
                    <span className={styles.chip}>
                      More <ChevronDownIcon />
                    </span>
                    <span className={styles.saveSearch}>Save Search</span>
                  </div>

                  <div className={styles.screenBody}>
                    <div className={styles.listingsHead}>
                      <span className={styles.lhTitle}>Featured Listings</span>
                      <span className={styles.lhTools}>
                        <span>
                          Sort by <b>Newest</b> <ChevronDownIcon />
                        </span>
                        <span>Hide Map</span>
                      </span>
                    </div>

                    <div className={styles.split}>
                      <div className={styles.map} aria-hidden="true">
                        <svg viewBox="0 0 238 460" preserveAspectRatio="xMidYMid slice">
                          <rect width="238" height="460" fill="#EAECE7" />
                          <ellipse cx="48" cy="88" rx="52" ry="40" fill="#CFE6C4" />
                          <path d="M150 340 q40 -26 88 -10 l0 70 q-50 14 -88 -8 z" fill="#CFE6C4" />
                          <ellipse cx="205" cy="60" rx="46" ry="34" fill="#BFDCF2" />
                          <g stroke="#D9DCD4" strokeWidth={7} fill="none">
                            <path d="M-10 150 C 60 140, 150 170, 250 150" />
                            <path d="M-10 260 C 70 250, 160 280, 250 262" />
                            <path d="M60 -10 C 66 120, 52 300, 66 470" />
                            <path d="M150 -10 C 146 140, 158 320, 148 470" />
                            <path d="M-10 380 C 80 366, 170 392, 250 376" />
                          </g>
                          <g stroke="#FFFFFF" strokeWidth={4.5} fill="none">
                            <path d="M-10 150 C 60 140, 150 170, 250 150" />
                            <path d="M-10 260 C 70 250, 160 280, 250 262" />
                            <path d="M60 -10 C 66 120, 52 300, 66 470" />
                            <path d="M150 -10 C 146 140, 158 320, 148 470" />
                            <path d="M-10 380 C 80 366, 170 392, 250 376" />
                          </g>
                          <path
                            d="M-10 210 C 80 196, 170 226, 250 206"
                            stroke="#E8BD52"
                            strokeWidth={7}
                            fill="none"
                          />
                          <path
                            d="M-10 210 C 80 196, 170 226, 250 206"
                            stroke="#F7D683"
                            strokeWidth={4.5}
                            fill="none"
                          />
                          <g stroke="#FFFFFF" strokeWidth={2.5} fill="none" opacity={0.85}>
                            <path d="M0 60 H238 M0 110 H238 M0 320 H238 M0 430 H238 M105 0 V460 M195 0 V460 M25 0 V460" />
                          </g>
                          <g fontFamily="Inter,system-ui" fontSize={9.5} fontWeight={700} textAnchor="middle">
                            {mapPins.map((p) => (
                              <g key={`${p.x}-${p.y}`}>
                                <rect
                                  x={p.x}
                                  y={p.y}
                                  width={p.w}
                                  height={18}
                                  rx={9}
                                  fill={p.brand ? "#2E5BFF" : "#111A38"}
                                />
                                <text x={p.x + p.w / 2} y={p.y + 13} fill="#fff">
                                  {p.price}
                                </text>
                              </g>
                            ))}
                          </g>
                        </svg>
                        <div className={styles.mapChips}>
                          <span className={styles.mapChip}>
                            Schools <ChevronDownIcon />
                          </span>
                          <span className={styles.mapChip}>Draw</span>
                        </div>
                        <div className={styles.mapZoom}>
                          <span>+</span>
                          <span>−</span>
                        </div>
                        <span className={styles.redo}>Redo search in this area</span>
                      </div>

                      <div className={styles.grid2}>
                        {listings.map((listing) => (
                          <ListingCard
                            key={listing.address}
                            listing={listing}
                            sizes="(max-width: 640px) 45vw, 220px"
                            large
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={styles.hinge} />
              <div className={styles.deck} />
            </div>

            {/* iPhone (left) */}
            <div className={styles.phone} aria-hidden="true">
              <div className={styles.phoneFrame}>
                <div className={styles.pScreen}>
                  <div className={styles.island} />
                  <div className={styles.statusbar}>
                    <span>9:41</span>
                    <span className={styles.icons}>
                      <SignalIcon />
                      <WifiIcon />
                      <BatteryIcon />
                    </span>
                  </div>
                  <div className={styles.pSearch}>
                    <SearchIcon />
                    Area, City, ZIP…
                  </div>
                  <div className={styles.pHead}>
                    <h4>Featured Listings</h4>
                    <span>Newest ⇅</span>
                  </div>
                  <div className={styles.phoneBody}>
                    {listings.slice(0, 2).map((listing) => (
                      <ListingCard key={listing.address} listing={listing} sizes="170px" />
                    ))}
                    <span className={styles.mapFab}>
                      <MapFabIcon />
                      Map
                    </span>
                  </div>
                  <div className={styles.homebar} />
                </div>
              </div>
            </div>
          </div>

          {/* Benefits + CTA */}
          <div>
            <div className={styles.benefits}>
              {benefits.map((b) => (
                <div className={styles.benefit} key={b.strong}>
                  <span className={styles.check}>
                    <CheckIcon />
                  </span>
                  <p>
                    <strong>{b.strong}</strong> <span>{b.rest}</span>
                  </p>
                </div>
              ))}
            </div>

            <p className={styles.trustNote}>
              <ShieldIcon />
              Powered by your own IDX Broker account
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

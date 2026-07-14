import type { SiteLinks } from "@/lib/public-site/site-links";

/**
 * Shared branded header for AgentStack's "composed" public pages — see
 * "AI Website Studio: compose the existing public pages into one site".
 * Renders on the public IDX search/detail pages and booking pages so a
 * visitor can move between them and feel like they're on one site, not
 * three disconnected tools. Styled to match the IDX pages' existing
 * neutral palette (this is the FIRST shared public-page component in the
 * codebase — every other public route today hand-rolls its own header).
 *
 * Server-safe — no client hooks, works directly in server components.
 */

export interface PublicSiteNavProps {
  sub: { name: string; logoUrl?: string | null };
  links: SiteLinks;
  current: "home" | "listings" | "booking";
}

export function PublicSiteNav({ sub, links, current }: PublicSiteNavProps) {
  const bookingHref = links.booking[0]?.url ?? null;

  const navItems: { key: PublicSiteNavProps["current"]; label: string; href: string }[] = [];
  if (links.home) navItems.push({ key: "home", label: "Home", href: links.home.url });
  if (links.listings) {
    navItems.push({ key: "listings", label: "Listings", href: links.listings.url });
  }
  if (bookingHref) {
    navItems.push({ key: "booking", label: "Book a time", href: bookingHref });
  }

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
        <div className="flex items-center gap-3">
          {sub.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external host, matches the rest of the codebase's public-page image convention
            <img
              src={sub.logoUrl}
              alt={sub.name}
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : null}
          <h1 className="text-xl font-semibold text-neutral-900">{sub.name}</h1>
        </div>
        {navItems.length > 1 && (
          <nav className="flex items-center gap-4 text-sm">
            {navItems.map((item) => (
              <a
                key={item.key}
                href={item.href}
                className={
                  item.key === current
                    ? "font-semibold text-neutral-900 underline underline-offset-4"
                    : "font-medium text-neutral-600 hover:text-neutral-900"
                }
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}


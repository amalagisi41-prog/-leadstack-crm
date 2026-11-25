/**
 * Workspace pages Cmd+K can jump to by name or keyword. Records (contacts,
 * deals…) are searched separately; this makes features discoverable even
 * when there's no record to match yet.
 */
export interface SearchablePage {
  title: string;
  /** Sub-account-relative path. */
  path: string;
  description: string;
  keywords: string[];
}

export const SEARCHABLE_PAGES: SearchablePage[] = [
  {
    title: "Review Requests",
    path: "/review-requests",
    description: "Google review requests after closing, and every send's log",
    keywords: ["review", "reviews", "google review", "reputation", "testimonial", "rating"],
  },
];

export function matchPages(query: string): SearchablePage[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SEARCHABLE_PAGES.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.keywords.some((k) => k.includes(q) || q.includes(k)),
  );
}

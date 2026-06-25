import { Badge } from "@/components/ui/badge";
import type { ContactSource } from "@/types/contacts";

/**
 * Visual badge for a contact's source. Known sources get an explicit
 * label + color; UTM-derived values (e.g. "google", "newsletter") that
 * flow through from form submissions render as a neutral capitalised
 * label so reporting still surfaces them without crashing the table.
 */

const LABELS: Record<Exclude<ContactSource, "">, string> = {
  "website-form": "Website Form",
  "web-chat": "Web Chat",
  "booking-page": "Booking",
  community: "Community",
  website: "Website",
  referral: "Referral",
  ads: "Ads",
  other: "Other",
  facebook: "Facebook",
  instagram: "Instagram",
};

const STYLES: Record<Exclude<ContactSource, "">, string> = {
  "website-form":
    "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  "web-chat":
    "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  "booking-page":
    "bg-teal-500/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
  community:
    "bg-orange-500/10 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
  website:
    "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  referral:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  ads: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  other:
    "bg-zinc-500/10 text-zinc-700 dark:bg-zinc-400/15 dark:text-zinc-300",
  facebook:
    "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  instagram:
    "bg-pink-500/10 text-pink-700 dark:bg-pink-400/15 dark:text-pink-300",
};

const FALLBACK_STYLE =
  "bg-zinc-500/10 text-zinc-700 dark:bg-zinc-400/15 dark:text-zinc-300";

export function SourceBadge({ source }: { source: ContactSource }) {
  if (!source) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const knownLabel = LABELS[source as Exclude<ContactSource, "">];
  const knownStyle = STYLES[source as Exclude<ContactSource, "">];
  // Unknown source = treat as UTM tag (e.g. "google", "newsletter").
  // Capitalise the first letter so it's not jarring next to the labelled ones.
  const label =
    knownLabel ??
    (typeof source === "string" && source.length > 0
      ? source.charAt(0).toUpperCase() + source.slice(1)
      : "—");
  return (
    <Badge variant="secondary" className={knownStyle ?? FALLBACK_STYLE}>
      {label}
    </Badge>
  );
}

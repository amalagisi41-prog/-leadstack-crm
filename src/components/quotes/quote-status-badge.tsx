import { cn } from "@/lib/utils";
import type { QuoteStatus } from "@/types/quotes";

/**
 * Coloured pill for a quote's status. Used on the list page rows, the
 * detail header, and the contact-profile section card. Driven by
 * `effectiveQuoteStatus()` (not the raw stored status) so an unaccepted
 * quote past its validUntil date displays as "Expired" even before any
 * write has happened.
 */

const STATUS_STYLES: Record<QuoteStatus, { label: string; className: string }> =
  {
    draft: {
      label: "Draft",
      className: "bg-muted text-muted-foreground",
    },
    sent: {
      label: "Sent",
      className:
        "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    },
    viewed: {
      label: "Viewed",
      className:
        "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    },
    accepted: {
      label: "Accepted",
      className:
        "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    },
    declined: {
      label: "Declined",
      className:
        "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    },
    expired: {
      label: "Expired",
      className:
        "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    paid: {
      label: "Paid",
      className:
        "bg-emerald-500 text-white",
    },
  };

export function QuoteStatusBadge({
  status,
  className,
}: {
  status: QuoteStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

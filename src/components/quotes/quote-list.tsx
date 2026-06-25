"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { computeQuoteTotals, effectiveQuoteStatus } from "@/lib/quotes/calc";
import { subscribeToQuotes } from "@/lib/firestore/quotes";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Quote, QuoteStatus } from "@/types/quotes";
import type { TenantScope } from "@/types";

/**
 * Sub-account-wide quote list. Subscribes to all quotes in the active
 * sub-account and renders them as rows with status pill + total. Filter
 * chips at the top let the operator narrow by status; a text search
 * matches against quote number + contact name + billed-to-organization.
 *
 * Used by:
 *   - the standalone /sa/[id]/quotes page
 *
 * The contact-profile section card (ContactQuotes) uses
 * subscribeToQuotesForContact() directly with a slimmer layout — different
 * component (this one would be overkill at 3 rows).
 */

type StatusFilter = QuoteStatus | "all";

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "expired", label: "Expired" },
  { value: "paid", label: "Paid" },
];

interface QuoteListProps {
  scope: TenantScope;
  /** Map of contactId → contact display name. Caller fetches contacts
   *  separately (we don't double-subscribe inside this list). */
  contactNames: Record<string, string>;
}

export function QuoteList({ scope, contactNames }: QuoteListProps) {
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!filterReady) return;
    setLoading(true);
    const unsubscribe = subscribeToQuotes(scope, { territoryFilter }, (data) => {
      setQuotes(data);
      setLoading(false);
    });
    return unsubscribe;
  }, [scope, filterReady, territoryFilter]);

  // Count per status — used to badge the filter chips.
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: quotes.length,
      draft: 0,
      sent: 0,
      viewed: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      paid: 0,
    };
    for (const q of quotes) {
      const eff = effectiveQuoteStatus(q);
      counts[eff] = (counts[eff] ?? 0) + 1;
    }
    return counts;
  }, [quotes]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter((q) => {
      const eff = effectiveQuoteStatus(q);
      if (filter !== "all" && eff !== filter) return false;
      if (!term) return true;
      const contactName = (contactNames[q.contactId] ?? "").toLowerCase();
      const billedTo = (q.billedToOrganization ?? "").toLowerCase();
      return (
        q.quoteNumber.toLowerCase().includes(term) ||
        contactName.includes(term) ||
        billedTo.includes(term)
      );
    });
  }, [quotes, filter, search, contactNames]);

  if (loading) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Loading quotes…
      </Card>
    );
  }

  if (quotes.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileText className="h-5 w-5" />
        </span>
        <p className="text-sm font-medium">No quotes or invoices yet</p>
        <p className="max-w-md text-xs text-muted-foreground">
          Use &ldquo;New quote&rdquo; to create one. Pick the
          <strong> Quote</strong> type to send an estimate, or <strong>Invoice</strong> to bill directly.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter chips + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_CHIPS.map((chip) => {
            const isActive = filter === chip.value;
            const count = statusCounts[chip.value] ?? 0;
            if (chip.value !== "all" && count === 0 && !isActive) return null;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setFilter(chip.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search quote number, contact, organization…"
          className="w-full sm:w-64"
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No quotes match this filter.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="hidden grid-cols-[1fr_6rem_2fr_1fr_8rem_8rem] gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
            <div>Number</div>
            <div>Type</div>
            <div>Recipient</div>
            <div>Status</div>
            <div className="text-right">Total</div>
            <div className="text-right">Updated</div>
          </div>
          {/* Rows */}
          <ul className="divide-y">
            {filtered.map((q) => {
              const eff = effectiveQuoteStatus(q);
              const totals = computeQuoteTotals(q);
              const recipient =
                contactNames[q.contactId] ?? "(deleted contact)";
              const isInvoice = q.kind === "invoice";
              return (
                <li key={q.id}>
                  <Link
                    href={`/sa/${scope.subAccountId}/quotes/${q.id}`}
                    className="grid grid-cols-2 gap-2 px-4 py-3 text-sm transition-colors hover:bg-muted/30 sm:grid-cols-[1fr_6rem_2fr_1fr_8rem_8rem] sm:items-center"
                  >
                    <div className="font-mono text-xs font-semibold text-foreground sm:text-sm">
                      {q.quoteNumber}
                    </div>
                    <div className="sm:order-none">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                          isInvoice
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-violet-500/10 text-violet-700 dark:text-violet-400",
                        )}
                      >
                        {isInvoice ? "Invoice" : "Quote"}
                      </span>
                    </div>
                    <div className="truncate text-foreground sm:order-none">
                      <p className="truncate font-medium">{recipient}</p>
                      {q.billedToOrganization && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {q.billedToOrganization}
                        </p>
                      )}
                    </div>
                    <div className="sm:order-none">
                      <QuoteStatusBadge status={eff} />
                    </div>
                    <div className="text-right font-medium tabular-nums sm:order-none">
                      {formatCurrency(totals.total, q.currency)}
                    </div>
                    <div className="text-right text-xs text-muted-foreground sm:order-none">
                      {formatRelativeTime(q.updatedAt)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

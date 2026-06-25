"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText, Plus } from "lucide-react";

import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { subscribeToQuotesForContact } from "@/lib/firestore/quotes";
import { computeQuoteTotals, effectiveQuoteStatus } from "@/lib/quotes/calc";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import type { Quote } from "@/types/quotes";
import type { TenantScope } from "@/types";

/**
 * Section card for the contact profile page. Lists quotes for a single
 * contact (newest first) with a "+ Quote" header action that links to
 * the new-quote page with the contact pre-selected.
 *
 * Mirrors the layout pattern of the existing <ContactDeals> + <ContactTasks>
 * cards stacked on the contact profile's left column.
 */

interface ContactQuotesProps {
  contactId: string;
  scope: TenantScope;
}

export function ContactQuotes({ contactId, scope }: ContactQuotesProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToQuotesForContact(
      contactId,
      scope,
      (data) => {
        setQuotes(data);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [contactId, scope]);

  const newHref = `/sa/${scope.subAccountId}/quotes/new?contactId=${contactId}`;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Quotes</h2>
        <Button
          render={<Link href={newHref} />}
          variant="ghost"
          size="sm"
          className="gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Quote
        </Button>
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : quotes.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-md border border-dashed py-6 text-center">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            No quotes for this contact yet.
          </p>
          <Button
            render={<Link href={newHref} />}
            variant="outline"
            size="sm"
          >
            Create first quote
          </Button>
        </div>
      ) : (
        <ul className="mt-3 divide-y">
          {quotes.map((q) => {
            const eff = effectiveQuoteStatus(q);
            const totals = computeQuoteTotals(q);
            return (
              <li key={q.id}>
                <Link
                  href={`/sa/${scope.subAccountId}/quotes/${q.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold text-foreground">
                      {q.quoteNumber}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatRelativeTime(q.updatedAt)}
                    </p>
                  </div>
                  <QuoteStatusBadge status={eff} />
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatCurrency(totals.total, q.currency)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

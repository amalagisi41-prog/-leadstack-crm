"use client";

import { useEffect, useState } from "react";
import { Briefcase } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToDealsForContact } from "@/lib/firestore/deals";
import { formatCurrency, daysSince } from "@/lib/format";
import { getStage, type Deal } from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Contact } from "@/types/contacts";
import { NewDealDialog } from "@/components/pipeline/new-deal-dialog";
import { Button } from "@/components/ui/button";

export function ContactDeals({ contact }: { contact: Contact }) {
  const { user } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const stages = usePipelineStages();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !agencyId) return;
    setLoading(true);
    const unsub = subscribeToDealsForContact(
      contact.id,
      { agencyId, subAccountId },
      (list) => {
        setDeals(list);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [contact.id, user, agencyId, subAccountId]);

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Deals
          </p>
          <p className="mt-0.5 text-sm font-semibold">
            {loading ? "…" : `${deals.length} on this contact`}
          </p>
        </div>
        <NewDealDialog
          contacts={[contact]}
          defaultContactId={contact.id}
          trigger={
            <Button size="sm" variant="outline" className="pointer-events-none">
              + Add deal
            </Button>
          }
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border bg-muted/40"
            />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          No deals yet. Track your first opportunity.
        </p>
      ) : (
        <ul className="space-y-2">
          {deals.map((deal) => {
            const stage = getStage(deal.stageId, stages);
            const days = daysSince(deal.stageChangedAt);
            return (
              <li
                key={deal.id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{deal.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(deal.value, deal.currency)} ·{" "}
                      {days === 0 ? "today" : `${days}d in stage`}
                    </p>
                  </div>
                </div>
                <Link
                  href={saPath("/pipeline")}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 ${stage.tone}`}
                >
                  {stage.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

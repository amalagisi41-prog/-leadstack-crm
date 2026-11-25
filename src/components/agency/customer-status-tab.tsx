"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, Loader2, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CustomerStatusItem } from "@/lib/agency/customer-status";

/**
 * The agency Status tab a customer sees: what is connected, and what they
 * can connect next, each with its button. Built only from
 * lib/agency/customer-status.ts — server configuration problems never reach
 * this component (the operator sees them in the Internal tab).
 */
export function CustomerStatusTab({
  items,
  loading,
  error,
}: {
  items: CustomerStatusItem[] | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading && !items) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking your connections…
      </div>
    );
  }
  if (error) {
    return <p className="bg-card rounded-2xl border p-4 text-sm">We couldn&apos;t load your status right now. Please try again in a moment.</p>;
  }

  const actions = (items ?? []).filter((i) => i.state === "action");
  const connected = (items ?? []).filter((i) => i.state === "connected");
  const multiple = new Set((items ?? []).map((i) => i.subAccountId)).size > 1;
  const where = (i: CustomerStatusItem) => (multiple ? ` · ${i.subAccountName}` : "");

  return (
    <div className="space-y-4" data-testid="customer-status">
      <section className="bg-card rounded-2xl border p-5">
        <h2 className="text-sm font-semibold">Your connections</h2>
        <p className="text-muted-foreground text-xs">
          {actions.length === 0
            ? "Everything available to you is connected."
            : `${actions.length} thing${actions.length === 1 ? "" : "s"} you can connect to get more out of AgentStack.`}
        </p>
      </section>

      {actions.length > 0 ? (
        <ul className="space-y-2">
          {actions.map((i) => (
            <li key={i.id} className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                  <Plug className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {i.title}
                    <span className="text-muted-foreground font-normal">{where(i)}</span>
                  </p>
                  <p className="text-muted-foreground text-xs">{i.body}</p>
                </div>
              </div>
              {i.href && i.actionLabel ? (
                <Button size="sm" render={<Link href={`/sa/${i.subAccountId}${i.href}`} />}>
                  {i.actionLabel}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {connected.length > 0 ? (
        <ul className="bg-card divide-y rounded-xl border">
          {connected.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <CircleCheck className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">{i.title}</span>
              <span className="text-muted-foreground text-xs">
                {i.body}
                {where(i)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

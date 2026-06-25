"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RotateCw,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  WebhookDeliveryLogResponse,
  WebhookEventLogResponse,
} from "@/types/webhooks";
import {
  CodeBlock,
  fmtTime,
  httpStatusClass,
  LogToolbar,
  ModeBadge,
  type ModeFilter,
} from "./log-shared";

/**
 * Logs → Webhooks tab. One row per emitted event, expandable to its
 * per-attempt delivery rows. Each delivery offers a Resend that re-fires
 * the archived event to that subscription (reuses the redeliver endpoint).
 */
export function WebhookLogsTab() {
  const { subAccountId } = useSubAccount();
  const [events, setEvents] = useState<WebhookEventLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ModeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resendKey, setResendKey] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/logs/webhook-deliveries`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        events?: WebhookEventLogResponse[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load webhook logs.");
      setEvents(data.events ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [subAccountId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const visible = useMemo(
    () => (mode === "all" ? events : events.filter((e) => e.mode === mode)),
    [events, mode],
  );

  async function handleResend(
    eventId: string,
    delivery: WebhookDeliveryLogResponse,
  ) {
    const key = `${eventId}:${delivery.id}`;
    setResendKey(key);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/webhook-events/${eventId}/redeliver`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscriptionId: delivery.subscriptionId }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Resend failed.");
      }
      toast.success("Re-delivery queued. Refresh in a moment to see the result.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resend failed.");
    } finally {
      setResendKey(null);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <LogToolbar
        mode={mode}
        onModeChange={setMode}
        count={visible.length}
        loading={loading}
        onRefresh={refetch}
      />

      {loading && events.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border bg-background p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading webhook logs…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-background p-8 text-center">
          <p className="text-sm font-medium">No webhook events yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Each event emitted to a subscription is recorded here with its
            delivery attempts. Events are retained for 90 days.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-background">
          {visible.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              expanded={expandedId === event.id}
              onToggle={() =>
                setExpandedId((id) => (id === event.id ? null : event.id))
              }
              resendKey={resendKey}
              onResend={handleResend}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Each delivery retries 3× (1m / 5m / 30m) before it&apos;s marked
        exhausted; 10 consecutive failures auto-pauses the subscription.
        Resend re-fires the archived payload to a single subscription as a
        fresh attempt.
      </p>
    </section>
  );
}

function EventRow({
  event,
  expanded,
  onToggle,
  resendKey,
  onResend,
}: {
  event: WebhookEventLogResponse;
  expanded: boolean;
  onToggle: () => void;
  resendKey: string | null;
  onResend: (eventId: string, d: WebhookDeliveryLogResponse) => void;
}) {
  // Worst delivery status drives the row's summary dot — a single failure is
  // what the operator is hunting for.
  const summary = summarizeDeliveries(event.deliveries);
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-cyan-700 dark:text-cyan-300">
          {event.type}
        </span>
        <DeliveryStatusBadge label={summary.label} tone={summary.tone} />
        <span className="hidden w-24 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:inline">
          {event.deliveries.length}{" "}
          {event.deliveries.length === 1 ? "attempt" : "attempts"}
        </span>
        <ModeBadge mode={event.mode} />
        <span className="hidden shrink-0 text-[11px] text-muted-foreground md:inline">
          {fmtTime(event.createdAt)}
        </span>
      </button>

      {expanded && (
        <div className="space-y-2 border-t bg-muted/20 px-4 py-3">
          {event.deliveries.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No delivery attempts recorded for this event (no active
              subscription matched at emit time).
            </p>
          ) : (
            event.deliveries.map((d) => (
              <DeliveryRow
                key={d.id}
                delivery={d}
                busy={resendKey === `${event.id}:${d.id}`}
                onResend={() => onResend(event.id, d)}
              />
            ))
          )}
        </div>
      )}
    </li>
  );
}

function DeliveryRow({
  delivery,
  busy,
  onResend,
}: {
  delivery: WebhookDeliveryLogResponse;
  busy: boolean;
  onResend: () => void;
}) {
  const tone = statusTone(delivery.status);
  return (
    <div className="rounded-md border bg-background p-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">
          #{delivery.attempt}
        </span>
        <DeliveryStatusBadge label={delivery.status} tone={tone} />
        {delivery.httpStatus !== null && (
          <span
            className={cn(
              "font-mono text-[11px] font-semibold tabular-nums",
              httpStatusClass(delivery.httpStatus),
            )}
          >
            HTTP {delivery.httpStatus}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {delivery.url}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onResend}
          disabled={busy}
          className="h-7 shrink-0 px-2 text-[11px]"
          title="Re-fire this event to this subscription"
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RotateCw className="h-3 w-3" />
          )}
          Resend
        </Button>
      </div>

      {delivery.errorMessage && (
        <p className="mt-1.5 text-[11px] text-rose-700 dark:text-rose-400">
          {delivery.errorMessage}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>scheduled {fmtTime(delivery.scheduledAt)}</span>
        {delivery.attemptedAt && <span>attempted {fmtTime(delivery.attemptedAt)}</span>}
        {delivery.nextRetryAt && (
          <span className="text-amber-600 dark:text-amber-400">
            next retry {fmtTime(delivery.nextRetryAt)}
          </span>
        )}
      </div>

      {delivery.responseBody && (
        <div className="mt-2">
          <CodeBlock label="Response body" value={delivery.responseBody} />
        </div>
      )}
    </div>
  );
}

type Tone = "ok" | "fail" | "pending";

function DeliveryStatusBadge({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tone === "ok" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "fail" && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
        tone === "pending" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      {label}
    </span>
  );
}

function statusTone(status: WebhookDeliveryLogResponse["status"]): Tone {
  if (status === "succeeded") return "ok";
  if (status === "pending") return "pending";
  return "fail";
}

function summarizeDeliveries(
  deliveries: WebhookDeliveryLogResponse[],
): { label: string; tone: Tone } {
  if (deliveries.length === 0) return { label: "no deliveries", tone: "pending" };
  if (deliveries.some((d) => d.status === "succeeded")) {
    return { label: "delivered", tone: "ok" };
  }
  if (deliveries.some((d) => d.status === "pending")) {
    return { label: "pending", tone: "pending" };
  }
  if (deliveries.some((d) => d.status === "exhausted")) {
    return { label: "exhausted", tone: "fail" };
  }
  return { label: "failed", tone: "fail" };
}

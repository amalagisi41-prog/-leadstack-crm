"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DECLINE_REASONS,
  type DeclineReason,
  type QuoteRespondPayload,
} from "@/types/quotes";
import type { SerializableQuote } from "@/app/q/[token]/page";

/**
 * Recipient-facing quote view rendered inside the public /q/[token]
 * page. Read-only quote summary plus two actions: Accept (one click)
 * or Decline (opens reason picker modal — borrowed UX from GHL's
 * Documents/Estimates flow).
 *
 * Status handling:
 *   - draft (shouldn't happen — operator hasn't sent yet, no token)
 *   - sent | viewed → show Accept + Decline buttons
 *   - accepted | paid → show "thanks, accepted on …" panel
 *   - declined → show "this quote was declined" panel
 *   - expired (read-time from `expired` prop) → show "this quote has
 *     expired" panel, no buttons
 *
 * The Accept/Decline POST is identical for both paths; differs only by
 * the action + reason payload. Response triggers a soft refresh of the
 * page so the new status reflects without manual reload.
 */

interface PublicQuoteViewProps {
  quote: SerializableQuote;
  token: string;
  businessName: string;
  businessLogoUrl?: string | null;
  expired: boolean;
}

export function PublicQuoteView({
  quote,
  token,
  businessName,
  businessLogoUrl,
  expired,
}: PublicQuoteViewProps) {
  const isInvoice = quote.kind === "invoice";
  const docLabel = isInvoice ? "Invoice" : "Quote";
  const totals = computeQuoteTotals(quote);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  const [error, setError] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState<DeclineReason>("Too expensive");
  const [note, setNote] = useState("");
  const [respondedAction, setRespondedAction] = useState<
    "accept" | "decline" | null
  >(null);

  // Invoices have no Accept/Decline path — the only "terminal" state
  // from the recipient's POV is paid. Expired and Pay redirects to
  // Stripe are non-terminal here (still show the Pay button).
  const isTerminal = isInvoice
    ? quote.status === "paid"
    : quote.status === "accepted" ||
      quote.status === "declined" ||
      quote.status === "paid" ||
      expired ||
      respondedAction !== null;

  const handleRespond = async (payload: QuoteRespondPayload) => {
    setError(null);
    setBusy(payload.action);
    try {
      const res = await fetch(`/api/quotes/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (HTTP ${res.status})`);
      }
      setRespondedAction(payload.action);
      setDeclineOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const handleAccept = () => handleRespond({ action: "accept" });

  const handleDeclineConfirm = () => {
    if (reason === "Other" && !note.trim()) {
      setError("Please add a quick note so the team knows what to follow up on.");
      return;
    }
    handleRespond({
      action: "decline",
      reason,
      note: note.trim() || undefined,
    });
  };

  const validUntilDisplay = quote.validUntil
    ? new Date(quote.validUntil).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Status banner */}
      {isTerminal && (
        <StatusBanner
          quoteStatus={quote.status}
          expired={expired}
          respondedAction={respondedAction}
          kind={quote.kind}
        />
      )}

      {/* Header */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {businessLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={businessLogoUrl}
                alt={businessName}
                className="mb-3 h-12 w-auto max-w-[200px] object-contain"
              />
            )}
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {docLabel} from
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {businessName}
            </h1>
            {quote.billedToOrganization && (
              <p className="mt-2 text-sm text-muted-foreground">
                {isInvoice ? "Billed to " : "Prepared for "}
                <span className="font-medium text-foreground">
                  {quote.billedToOrganization}
                </span>
              </p>
            )}
            {quote.billingAddress && (
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                {quote.billingAddress}
              </p>
            )}
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {docLabel} number
            </p>
            <p className="mt-1 font-mono text-sm font-semibold">
              {quote.quoteNumber}
            </p>
            {!isInvoice && validUntilDisplay && (
              <p
                className={cn(
                  "mt-2 inline-flex items-center gap-1.5 text-xs",
                  expired
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-muted-foreground",
                )}
              >
                <Clock className="h-3 w-3" />
                {expired ? "Expired " : "Valid until "}
                {validUntilDisplay}
              </p>
            )}
            {isInvoice && quote.paymentDueDays !== null && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatPaymentDue(quote.paymentDueDays)}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Line items + totals */}
      <Card className="p-6">
        <div className="hidden grid-cols-[1fr_5rem_8rem_8rem] gap-3 border-b pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
          <div>Description</div>
          <div className="text-right">Qty</div>
          <div className="text-right">Unit price</div>
          <div className="text-right">Total</div>
        </div>
        <ul className="divide-y">
          {quote.lineItems.map((item) => {
            const lineTotal =
              (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
            return (
              <li
                key={item.id}
                className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm sm:grid-cols-[1fr_5rem_8rem_8rem] sm:items-baseline"
              >
                <div className="font-medium text-foreground">
                  {item.description || (
                    <span className="italic text-muted-foreground">
                      Untitled item
                    </span>
                  )}
                </div>
                <div className="text-right text-muted-foreground tabular-nums">
                  <span className="sm:hidden">Qty </span>
                  {item.quantity}
                </div>
                <div className="hidden text-right text-muted-foreground tabular-nums sm:block">
                  {formatCurrency(item.unitPrice, quote.currency)}
                </div>
                <div className="col-span-2 text-right font-medium tabular-nums sm:col-span-1">
                  {formatCurrency(lineTotal, quote.currency)}
                </div>
              </li>
            );
          })}
        </ul>

        <Separator className="my-4" />

        <div className="ml-auto max-w-xs space-y-1.5 text-sm">
          <TotalRow
            label="Subtotal"
            value={formatCurrency(totals.subtotal, quote.currency)}
          />
          {totals.discountAmount > 0 && (
            <TotalRow
              label="Discount"
              value={`− ${formatCurrency(totals.discountAmount, quote.currency)}`}
            />
          )}
          {totals.taxAmount > 0 && (
            <TotalRow
              label={`Tax (${quote.globalTaxPercent ?? 0}%)`}
              value={formatCurrency(totals.taxAmount, quote.currency)}
            />
          )}
          <Separator className="my-1" />
          <TotalRow
            label="Total"
            value={formatCurrency(totals.total, quote.currency)}
            strong
          />
        </div>
      </Card>

      {/* Terms */}
      {quote.termsAndNotes.trim() && (
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Terms &amp; notes
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
            {quote.termsAndNotes}
          </p>
        </Card>
      )}

      {/* PDF download — always available, even after accept/decline/pay
          so the recipient can keep a copy for their records. */}
      <div className="flex justify-center">
        <a
          href={`/api/quotes/${token}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <Download className="h-3 w-3" />
          Download PDF
        </a>
      </div>

      {/* Action bar */}
      {!isTerminal && (
        <Card className="p-6">
          {error && (
            <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {isInvoice ? (
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Pay securely via PayPal. You&apos;ll receive a receipt by
                email once payment clears.
              </p>
              {quote.paymentLinkUrl ? (
                <a
                  href={quote.paymentLinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
                >
                  <CreditCard className="h-4 w-4" />
                  Pay {formatCurrency(totals.total, quote.currency)}
                </a>
              ) : (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Payment link not yet generated — please ask the sender
                  to re-send.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Ready to proceed? Accept the quote and the team will be in
                touch with next steps.
              </p>
              <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeclineOpen(true)}
                  disabled={busy !== null}
                >
                  Decline
                </Button>
                <Button
                  type="button"
                  onClick={handleAccept}
                  disabled={busy !== null}
                >
                  {busy === "accept" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Accepting…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Accept this quote
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            Secure link — only the recipient of this email can view it
          </p>
        </Card>
      )}

      {/* Decline modal */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline this quote</DialogTitle>
            <DialogDescription>
              A quick reason helps the team understand and follow up
              appropriately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label
                htmlFor="decline-reason"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Reason
              </Label>
              <select
                id="decline-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value as DeclineReason)}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_option]:bg-background [&_option]:text-foreground"
              >
                {DECLINE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label
                htmlFor="decline-note"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Note {reason === "Other" ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                id="decline-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="A short note — what would make this work, or why this isn't the right time."
                className="mt-1"
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeclineOpen(false)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeclineConfirm}
                disabled={busy !== null}
              >
                {busy === "decline" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send decline"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBanner({
  quoteStatus,
  expired,
  respondedAction,
  kind,
}: {
  quoteStatus: SerializableQuote["status"];
  expired: boolean;
  respondedAction: "accept" | "decline" | null;
  kind: SerializableQuote["kind"];
}) {
  const isInvoice = kind === "invoice";
  if (isInvoice && quoteStatus === "paid") {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Invoice paid — thank you!
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A receipt has been emailed. You can close this page.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  if (respondedAction === "accept" || quoteStatus === "accepted" || quoteStatus === "paid") {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Quote accepted — thank you!
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The team will be in touch with next steps. You can close
              this page.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  if (respondedAction === "decline" || quoteStatus === "declined") {
    return (
      <Card className="border-rose-500/30 bg-rose-500/5 p-5">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">
              Quote declined
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Thanks for letting us know. The team can follow up if you
              change your mind.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  if (expired) {
    return (
      <Card className="border-amber-500/30 bg-amber-500/5 p-5">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              This quote has expired
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reply to the email to request an updated version.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  return null;
}

function formatPaymentDue(days: number): string {
  if (days <= 0) return "Due on receipt";
  if (days === 1) return "Due within 1 day";
  return `Due within ${days} days`;
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between",
        strong && "text-base",
      )}
    >
      <span className={cn(strong ? "font-semibold" : "text-muted-foreground")}>
        {label}
      </span>
      <span className={cn("tabular-nums", strong ? "font-bold" : "font-medium")}>
        {value}
      </span>
    </div>
  );
}

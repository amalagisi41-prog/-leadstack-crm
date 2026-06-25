"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { ArrowRight, CheckCircle2, Download, Loader2, Send, Trash2 } from "lucide-react";

import { QuoteBuilder, type QuoteFormValues } from "@/components/quotes/quote-builder";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { computeQuoteTotals, effectiveQuoteStatus } from "@/lib/quotes/calc";
import { deleteQuote, updateDraftQuote } from "@/lib/firestore/quotes";
import { subscribeToProducts } from "@/lib/firestore/products";
import type { Product } from "@/types/products";
import {
  formatContactDate,
  formatCurrency,
  formatRelativeTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Quote } from "@/types/quotes";
import type { TenantScope } from "@/types";

/**
 * Operator-facing detail/edit view for a single quote.
 *
 * Two modes, toggled by an Edit button:
 *   - View: read-only summary of the quote (header, recipient, line
 *     items, totals, terms) plus action buttons (Send / Mark paid /
 *     Delete / Edit).
 *   - Edit: mounts <QuoteBuilder> wired to update the existing quote.
 *
 * Lifecycle actions (Send, Mark paid) hit server-side API routes added
 * in Day 3. Edit + Delete use the client-side Firestore helpers directly
 * since they don't need atomic sequence-number issuance or token
 * minting. Delete is gated to draft quotes in the UI (Firestore rules
 * enforce server-side too).
 */

interface QuoteDetailProps {
  quote: Quote;
  scope: TenantScope;
  /** Recipient contact display name. */
  contactName: string;
  /** Path back to the list — used after delete. */
  listHref: string;
}

export function QuoteDetail({
  quote,
  scope,
  contactName,
  listHref,
}: QuoteDetailProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!editing) return;
    const unsub = subscribeToProducts(scope, (all) =>
      setProducts(all.filter((p) => p.active)),
    );
    return () => unsub();
  }, [editing, scope]);
  const [busy, setBusy] = useState<
    null | "send" | "mark-paid" | "delete" | "convert"
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const effStatus = effectiveQuoteStatus(quote);
  const totals = computeQuoteTotals(quote);

  const isInvoice = quote.kind === "invoice";
  const docNoun = isInvoice ? "invoice" : "quote";
  const canSend = quote.status === "draft" || quote.status === "sent";
  // Quotes: mark-paid only from accepted (recipient explicitly said yes).
  // Invoices: mark-paid from sent OR viewed (no "accepted" step — operator
  // confirms payment landed in their Stripe dashboard).
  const canMarkPaid = isInvoice
    ? quote.status === "sent" || quote.status === "viewed"
    : quote.status === "accepted";
  const canDelete = quote.status === "draft";
  const canConvert = quote.kind === "quote" && quote.status === "accepted";
  const sendLabel =
    quote.status === "sent" || quote.status === "viewed"
      ? `Re-send ${docNoun}`
      : `Send ${docNoun}`;

  const handleSend = async () => {
    setError(null);
    setFlash(null);
    setBusy("send");
    try {
      const res = await fetch(
        `/api/sub-accounts/${scope.subAccountId}/quotes/${quote.id}/send`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Send failed (HTTP ${res.status})`);
      }
      setFlash(`${isInvoice ? "Invoice" : "Quote"} sent to recipient.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(null);
    }
  };

  const handleMarkPaid = async () => {
    setError(null);
    setFlash(null);
    setBusy("mark-paid");
    try {
      const res = await fetch(
        `/api/sub-accounts/${scope.subAccountId}/quotes/${quote.id}/mark-paid`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Update failed (HTTP ${res.status})`);
      }
      setFlash(`${isInvoice ? "Invoice" : "Quote"} marked as paid.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mark-paid failed");
    } finally {
      setBusy(null);
    }
  };

  const handleConvert = async () => {
    if (
      !confirm(
        `Convert ${quote.quoteNumber} to an invoice? A new invoice number will be issued and the original quote link will stop working. You'll need to hit Send afterwards to email the invoice + payment link.`,
      )
    ) {
      return;
    }
    setError(null);
    setFlash(null);
    setBusy("convert");
    try {
      const res = await fetch(
        `/api/sub-accounts/${scope.subAccountId}/quotes/${quote.id}/convert-to-invoice`,
        { method: "POST" },
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        invoiceNumber?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `Convert failed (HTTP ${res.status})`);
      }
      setFlash(
        `Converted to invoice ${body.invoiceNumber}. Click Send to email it.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Convert failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete ${docNoun} ${quote.quoteNumber}? This can't be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    setBusy("delete");
    try {
      await deleteQuote(quote.id);
      router.push(listHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(null);
    }
  };

  const handleSaveEdit = async (values: QuoteFormValues) => {
    // Convert the form's `validUntilDateString` (yyyy-mm-dd) into a
    // Firestore Timestamp. End-of-day local time so a date picked as
    // "Dec 31" still treats Dec 31 23:59:59 as valid.
    const validUntil = values.validUntilDateString
      ? Timestamp.fromDate(
          new Date(`${values.validUntilDateString}T23:59:59`),
        )
      : null;

    await updateDraftQuote(quote.id, {
      lineItems: values.lineItems,
      currency: values.currency,
      globalDiscount: values.globalDiscount,
      globalTaxPercent: values.globalTaxPercent,
      termsAndNotes: values.termsAndNotes,
      billedToOrganization: values.billedToOrganization,
      billingAddress: values.billingAddress,
      validUntil,
      paymentDueDays: values.paymentDueDays,
      autoCreateDealOnAccept: values.autoCreateDealOnAccept,
    });
    setEditing(false);
    setFlash(`${isInvoice ? "Invoice" : "Quote"} saved.`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-semibold tracking-tight sm:text-2xl">
              {quote.quoteNumber}
            </h1>
            <QuoteStatusBadge status={effStatus} />
            {isInvoice && (
              <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Invoice
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Created {formatContactDate(quote.createdAt)} · last updated{" "}
            {formatRelativeTime(quote.updatedAt)}
          </p>
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-2">
            {canDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={busy !== null}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              render={
                <a
                  href={`/api/sub-accounts/${scope.subAccountId}/quotes/${quote.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <Download className="h-4 w-4" />
              PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              disabled={busy !== null}
            >
              Edit
            </Button>
            {canConvert && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleConvert}
                disabled={busy !== null}
              >
                {busy === "convert" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Converting…
                  </>
                ) : (
                  <>
                    <ArrowRight className="h-4 w-4" />
                    Convert to invoice
                  </>
                )}
              </Button>
            )}
            {canMarkPaid && (
              <Button
                type="button"
                size="sm"
                onClick={handleMarkPaid}
                disabled={busy !== null}
              >
                {busy === "mark-paid" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Marking…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Mark as paid
                  </>
                )}
              </Button>
            )}
            {canSend && (
              <Button
                type="button"
                size="sm"
                onClick={handleSend}
                disabled={busy !== null}
              >
                {busy === "send" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {sendLabel}
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {flash && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {editing ? (
        <QuoteBuilder
          initial={quote}
          kind={quote.kind}
          contactName={contactName}
          products={products}
          onSave={handleSaveEdit}
          onCancel={() => setEditing(false)}
          saveLabel="Save changes"
        />
      ) : (
        <>
          {/* Recipient summary */}
          <Card className="p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <SummaryField label="Recipient" value={contactName} />
              <SummaryField
                label="Billed to"
                value={quote.billedToOrganization ?? "—"}
                secondary={quote.billingAddress ?? undefined}
                mono={!quote.billedToOrganization}
              />
              <SummaryField label="Currency" value={quote.currency} mono />
              {isInvoice ? (
                <SummaryField
                  label="Payment due"
                  value={formatPaymentDueLabel(quote.paymentDueDays)}
                />
              ) : (
                <SummaryField
                  label="Valid until"
                  value={
                    quote.validUntil
                      ? formatContactDate(quote.validUntil)
                      : "No expiry"
                  }
                />
              )}
            </div>
          </Card>

          {/* Line items + totals */}
          <Card className="p-5">
            <div className="hidden grid-cols-[1fr_5rem_8rem_8rem] gap-3 border-b pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
              <div>Description</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Unit price</div>
              <div className="text-right">Total</div>
            </div>
            <ul className="divide-y">
              {quote.lineItems.map((item) => {
                const lineTotal =
                  (Number(item.quantity) || 0) *
                  (Number(item.unitPrice) || 0);
                return (
                  <li
                    key={item.id}
                    className="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm sm:grid-cols-[1fr_5rem_8rem_8rem] sm:items-baseline"
                  >
                    <div className="font-medium text-foreground">
                      {item.description || (
                        <span className="text-muted-foreground italic">
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
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Terms &amp; notes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                {quote.termsAndNotes}
              </p>
            </Card>
          )}

          {/* Lifecycle stamps — useful for the operator's audit eye */}
          {(quote.sentAt ||
            quote.viewedAt ||
            quote.acceptedAt ||
            quote.declinedAt ||
            quote.paidAt) && (
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Timeline
              </p>
              <dl className="mt-2 space-y-1 text-sm">
                {quote.sentAt && (
                  <Stamp label="Sent" value={formatRelativeTime(quote.sentAt)} />
                )}
                {quote.viewedAt && (
                  <Stamp
                    label="Viewed by recipient"
                    value={formatRelativeTime(quote.viewedAt)}
                  />
                )}
                {quote.acceptedAt && (
                  <Stamp
                    label="Accepted"
                    value={formatRelativeTime(quote.acceptedAt)}
                  />
                )}
                {quote.declinedAt && (
                  <Stamp
                    label={`Declined${quote.declineReason ? ` (${quote.declineReason})` : ""}`}
                    value={formatRelativeTime(quote.declinedAt)}
                    detail={quote.declineNote ?? null}
                  />
                )}
                {quote.paidAt && (
                  <Stamp
                    label="Marked as paid"
                    value={formatRelativeTime(quote.paidAt)}
                  />
                )}
              </dl>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function formatPaymentDueLabel(days: number | null): string {
  if (days === null) return "No specific date";
  if (days <= 0) return "Due on receipt";
  if (days === 1) return "Net 1 day";
  return `Net ${days} days`;
}

function SummaryField({
  label,
  value,
  secondary,
  mono,
}: {
  label: string;
  value: string;
  /** Optional second line under the value (e.g. billing address under
   *  the organization name). Renders pre-wrapped so multi-line strings
   *  keep their line breaks. */
  secondary?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-medium", mono && "font-mono")}>
        {value}
      </p>
      {secondary && (
        <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
          {secondary}
        </p>
      )}
    </div>
  );
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
      <span
        className={cn(strong ? "font-semibold" : "text-muted-foreground")}
      >
        {label}
      </span>
      <span
        className={cn("tabular-nums", strong ? "font-bold" : "font-medium")}
      >
        {value}
      </span>
    </div>
  );
}

function Stamp({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <div>
        <span className="text-muted-foreground">{label}</span>
        {detail && (
          <p className="mt-0.5 text-xs italic text-muted-foreground">
            &ldquo;{detail}&rdquo;
          </p>
        )}
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

import { notFound } from "next/navigation";
import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb } from "@/lib/firebase/admin";
import { hashQuoteToken, verifyQuoteToken } from "@/lib/quotes/token";
import { isQuoteExpired } from "@/lib/quotes/calc";
import { emitQuoteWebhook, recordQuoteActivity } from "@/lib/quotes/lifecycle";
import { PublicQuoteView } from "@/components/quotes/public-quote-view";
import { LogoMark } from "@/components/brand/logo-mark";
import type { Quote } from "@/types/quotes";

export const dynamic = "force-dynamic";

/**
 * Public recipient-facing quote page. Server-renders the quote so the
 * recipient sees a fully-formed document before any JS hydrates (the
 * Accept/Decline UI is the only interactive bit).
 *
 * Security model:
 *   1. Token verified via HMAC (quoteId.nonce.signature).
 *   2. Loaded quote's `publicTokenHash` compared against the hash of
 *      the presented token. Any mismatch (e.g. the operator re-sent
 *      and a leaked old token is being used) → 404.
 *   3. On first valid load with status === "sent", flip to "viewed"
 *      and stamp viewedAt. Idempotent: re-opens don't churn the doc.
 *
 * Out of scope for v1: PDF rendering, "save to my account" flow,
 * recipient comments thread, geo/IP capture beyond what hosting
 * already logs.
 */

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicQuotePage({ params }: PageProps) {
  const { token } = await params;

  const verified = verifyQuoteToken(token);
  if (!verified) notFound();

  const db = getAdminDb();
  const quoteSnap = await db.collection("quotes").doc(verified.quoteId).get();
  if (!quoteSnap.exists) notFound();

  const quote = {
    id: quoteSnap.id,
    ...(quoteSnap.data() as Omit<Quote, "id">),
  };

  // The hash on the quote is what was minted at the most recent send.
  // Mismatch = a leaked old token (or a forged one). Don't reveal the
  // quote exists; behave identically to "not found".
  if (quote.publicTokenHash !== hashQuoteToken(token)) {
    notFound();
  }

  // First-view tracking. Best-effort — don't fail the page render if
  // the write blips. The `quote_viewed` activity row is intentionally
  // not paired with a workflow trigger fire: views are a noisier
  // signal than sends / accepts / declines, and a `quote_viewed`
  // trigger surface can land in v2 if there's demand.
  if (quote.status === "sent" && !quote.viewedAt) {
    try {
      await quoteSnap.ref.update({
        status: "viewed",
        viewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Reflect locally so the rendered status matches what we just
      // wrote — saves a round-trip refresh.
      quote.status = "viewed";
      await recordQuoteActivity(quote, "quote_viewed");
      void emitQuoteWebhook(quote, "quote_viewed");
    } catch (err) {
      console.error("[/q/[token]] viewedAt update failed", err);
    }
  }

  // Business name + logo for the header. Sub-account doc is the source
  // of truth; fall back to a generic placeholder if it's gone (shouldn't
  // happen but keeps the page from crashing).
  const subSnap = await db
    .doc(`subAccounts/${quote.subAccountId}`)
    .get();
  const subData = subSnap.exists ? (subSnap.data() ?? {}) : {};
  const businessName =
    (subData.name as string | undefined) || "Your business";
  const businessLogoUrl =
    typeof subData.logoUrl === "string" &&
    /^https?:\/\/.+/i.test(subData.logoUrl as string)
      ? (subData.logoUrl as string)
      : null;

  const expired = isQuoteExpired(quote);

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-14 items-center gap-2 px-4 text-sm">
          {businessLogoUrl ? (
            // Sub-account brand override. Capped at 24px tall so it sits
            // cleanly in the chrome bar.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={businessLogoUrl}
              alt={businessName}
              className="h-6 w-auto max-w-[140px] object-contain"
            />
          ) : (
            <LogoMark size={18} idSuffix="-public-quote" />
          )}
          <span className="font-medium">{businessName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-xs text-muted-foreground">
            {quote.quoteNumber}
          </span>
        </div>
      </header>

      <main className="container mx-auto flex-1 px-4 py-10">
        <PublicQuoteView
          quote={serializeQuote(quote)}
          token={token}
          businessName={businessName}
          businessLogoUrl={businessLogoUrl}
          expired={expired}
        />
      </main>

      <footer className="border-t bg-background py-4">
        <div className="container mx-auto px-4 text-center text-[11px] text-muted-foreground">
          {quote.kind === "invoice" ? "Invoice" : "Quote"} sent via LeadStack.
          Reply to the email to reach {businessName}.
        </div>
      </footer>
    </div>
  );
}

/**
 * Strip Firestore-server-only types (Timestamp, FieldValue) so the
 * server component can pass the quote to a client component without
 * React serialization errors. Timestamps become milliseconds-since-epoch
 * numbers; nulls stay null; everything else round-trips fine.
 */
type SerializableQuote = Omit<
  Quote,
  | "createdAt"
  | "updatedAt"
  | "sentAt"
  | "viewedAt"
  | "acceptedAt"
  | "declinedAt"
  | "paidAt"
  | "validUntil"
  | "convertedFromQuoteAt"
  | "paymentLinkMintedAt"
> & {
  createdAt: number | null;
  updatedAt: number | null;
  sentAt: number | null;
  viewedAt: number | null;
  acceptedAt: number | null;
  declinedAt: number | null;
  paidAt: number | null;
  validUntil: number | null;
  convertedFromQuoteAt: number | null;
  paymentLinkMintedAt: number | null;
};

function serializeQuote(quote: Quote): SerializableQuote {
  return {
    ...quote,
    createdAt: tsMillis(quote.createdAt),
    updatedAt: tsMillis(quote.updatedAt),
    sentAt: tsMillis(quote.sentAt),
    viewedAt: tsMillis(quote.viewedAt),
    acceptedAt: tsMillis(quote.acceptedAt),
    declinedAt: tsMillis(quote.declinedAt),
    paidAt: tsMillis(quote.paidAt),
    validUntil: tsMillis(quote.validUntil),
    convertedFromQuoteAt: tsMillis(quote.convertedFromQuoteAt),
    paymentLinkMintedAt: tsMillis(quote.paymentLinkMintedAt),
    // Default kind for old docs that don't have it yet.
    kind: quote.kind ?? "quote",
  };
}

function tsMillis(value: unknown): number | null {
  if (!value) return null;
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null;
}

export type { SerializableQuote };

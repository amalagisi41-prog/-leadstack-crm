import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { hashQuoteToken, verifyQuoteToken } from "@/lib/quotes/token";
import { pdfFilename, renderQuotePdfStream } from "@/lib/quotes/pdf-render";
import type { Quote } from "@/types/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/quotes/[token]/pdf
 *
 * Public PDF download for the recipient. Same gating as the /q/[token]
 * page: HMAC token verified + stored hash compared. Treats any mismatch
 * as 404 (don't leak whether the quote exists).
 *
 * Shares the renderer with the operator-authenticated route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  const verified = verifyQuoteToken(token);
  if (!verified) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = getAdminDb();
  const snap = await db.collection("quotes").doc(verified.quoteId).get();
  if (!snap.exists) {
    return new NextResponse("Not found", { status: 404 });
  }
  const quote = { id: snap.id, ...(snap.data() as Omit<Quote, "id">) };
  if (quote.publicTokenHash !== hashQuoteToken(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [contactSnap, subSnap] = await Promise.all([
    db.doc(`contacts/${quote.contactId}`).get(),
    db.doc(`subAccounts/${quote.subAccountId}`).get(),
  ]);
  const contact = (contactSnap.exists ? contactSnap.data() : null) as {
    name?: string;
    email?: string;
    phone?: string;
  } | null;
  const recipientName = contact
    ? contact.name?.trim() ||
      contact.email?.trim() ||
      contact.phone?.trim() ||
      ""
    : "";
  const subData = subSnap.exists ? (subSnap.data() ?? {}) : {};
  const businessName =
    (subData.name as string | undefined) || "Your business";
  const businessLogoUrl =
    typeof subData.logoUrl === "string" ? (subData.logoUrl as string) : null;

  const stream = await renderQuotePdfStream({
    quote,
    businessName,
    businessLogoUrl,
    recipientName,
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFilename(quote)}"`,
      "Cache-Control": "no-store",
    },
  });
}

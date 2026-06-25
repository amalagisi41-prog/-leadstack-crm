import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { territoryGate } from "@/lib/auth/territory-filter";
import { issueQuoteNumber } from "@/lib/quotes/number";
import { GLOBAL_TERRITORY_ID } from "@/types";
import { DEFAULT_QUOTE } from "@/types/quotes";
import type {
  Quote,
  QuoteDiscount,
  QuoteKind,
  QuoteLineItem,
} from "@/types/quotes";

export const dynamic = "force-dynamic";

/**
 * POST /api/sub-accounts/[id]/quotes
 *
 * Create a new quote for a contact. Caller must be an active member of
 * the sub-account (any role — admin or collaborator). The server:
 *   1. Verifies contact exists + belongs to this sub-account
 *   2. Issues a per-sub-account sequence number (atomic txn)
 *   3. Persists the new quote with defaults + supplied fields
 *
 * The token is NOT issued here — it's issued by the /send endpoint when
 * the operator actually sends the quote. Until then the public URL
 * doesn't exist.
 *
 * Body shape (all optional except contactId):
 *   {
 *     contactId: string,
 *     lineItems?: QuoteLineItem[],
 *     currency?: string,
 *     globalDiscount?: QuoteDiscount,
 *     globalTaxPercent?: number | null,
 *     termsAndNotes?: string,
 *     billedToOrganization?: string | null,
 *     validUntilDateString?: string | null,   // "yyyy-mm-dd"
 *     autoCreateDealOnAccept?: boolean,
 *   }
 *
 * Returns: `{ id, quoteNumber }` on success.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: subAccountId } = await params;

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: CreateQuotePayload;
  try {
    body = (await request.json()) as CreateQuotePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
  if (!contactId) {
    return NextResponse.json(
      { error: "contactId is required" },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const contactSnap = await db.doc(`contacts/${contactId}`).get();
  if (!contactSnap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const contact = contactSnap.data() ?? {};
  if (contact.subAccountId !== subAccountId) {
    return NextResponse.json(
      { error: "Contact belongs to a different sub-account" },
      { status: 403 },
    );
  }
  // Territory scoping: a scoped collaborator can't create a quote for a
  // contact outside their assigned territories. No-op for admins /
  // owners / sub-accounts with scoping off.
  const gate = await territoryGate(
    access,
    (contact.territoryId as string | null | undefined) ?? null,
  );
  if (gate) return gate;

  const sanitized = sanitizePayload(body);
  const kind: QuoteKind = body.kind === "invoice" ? "invoice" : "quote";

  // A quote / invoice with zero line items isn't a useful document and
  // can't have a meaningful total — reject up-front. UI also gates this
  // (catalog-only line items, save disabled when empty) but the server
  // is the source of truth.
  if (!sanitized.lineItems || sanitized.lineItems.length === 0) {
    return NextResponse.json(
      { error: "Add at least one product from the catalog before saving." },
      { status: 400 },
    );
  }

  let quoteNumber: string;
  try {
    quoteNumber = await issueQuoteNumber(subAccountId, kind);
  } catch (err) {
    console.error("[quotes/create] issueQuoteNumber failed", err);
    return NextResponse.json(
      { error: "Failed to allocate quote number" },
      { status: 500 },
    );
  }

  const docRef = db.collection("quotes").doc();
  // Build the document. Use FieldValue.serverTimestamp() for createdAt /
  // updatedAt so they sort consistently with everything else in the
  // tenancy. publicTokenHash is empty until the first send.
  const doc: Omit<Quote, "id"> = {
    ...DEFAULT_QUOTE,
    kind,
    agencyId: access.agencyId ?? (contact.agencyId as string),
    subAccountId,
    createdByUid: access.uid,
    contactId,
    quoteNumber,
    publicTokenHash: "",
    // Inherit territory from the contact this quote is for — quotes
    // follow their account's territory (Global fallback).
    territoryId:
      (contact.territoryId as string | null | undefined) ??
      GLOBAL_TERRITORY_ID,
    ...sanitized,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    await docRef.set(doc);
  } catch (err) {
    console.error("[quotes/create] write failed", err);
    return NextResponse.json(
      { error: "Failed to create quote" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { id: docRef.id, quoteNumber },
    { status: 201 },
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

interface CreateQuotePayload {
  contactId?: string;
  kind?: QuoteKind;
  lineItems?: QuoteLineItem[];
  currency?: string;
  globalDiscount?: QuoteDiscount;
  globalTaxPercent?: number | null;
  termsAndNotes?: string;
  billedToOrganization?: string | null;
  billingAddress?: string | null;
  validUntilDateString?: string | null;
  paymentDueDays?: number | null;
  autoCreateDealOnAccept?: boolean;
}

/**
 * Clean + clamp the operator-supplied payload before writing. Trusts
 * the structure (TypeScript-ish typing on the client) but defends
 * against malformed values reaching Firestore.
 */
function sanitizePayload(body: CreateQuotePayload): Partial<Quote> {
  const out: Partial<Quote> = {};

  if (Array.isArray(body.lineItems)) {
    out.lineItems = body.lineItems
      .map((item): QuoteLineItem | null => {
        if (!item || typeof item !== "object") return null;
        const description =
          typeof item.description === "string" ? item.description.trim() : "";
        const quantity = Math.max(0, Number(item.quantity) || 0);
        const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
        const id =
          typeof item.id === "string" && item.id ? item.id : crypto.randomUUID();
        const productId =
          typeof item.productId === "string" && item.productId
            ? item.productId
            : null;
        return { id, description, quantity, unitPrice, productId };
      })
      .filter((x): x is QuoteLineItem => x !== null);
  }

  if (typeof body.currency === "string" && body.currency.trim()) {
    out.currency = body.currency.trim().toUpperCase().slice(0, 3);
  }

  if (body.globalDiscount === null) {
    out.globalDiscount = null;
  } else if (
    body.globalDiscount &&
    typeof body.globalDiscount === "object" &&
    (body.globalDiscount.type === "percent" || body.globalDiscount.type === "flat")
  ) {
    const value = Math.max(0, Number(body.globalDiscount.value) || 0);
    out.globalDiscount = { type: body.globalDiscount.type, value };
  }

  if (body.globalTaxPercent === null) {
    out.globalTaxPercent = null;
  } else if (typeof body.globalTaxPercent === "number") {
    const v = body.globalTaxPercent;
    if (!Number.isNaN(v) && v >= 0 && v <= 100) {
      out.globalTaxPercent = v;
    }
  }

  if (typeof body.termsAndNotes === "string") {
    // Cap to prevent runaway-size docs. ~10k chars is plenty for a quote.
    out.termsAndNotes = body.termsAndNotes.trim().slice(0, 10_000);
  }

  if (body.billedToOrganization === null) {
    out.billedToOrganization = null;
  } else if (typeof body.billedToOrganization === "string") {
    const trimmed = body.billedToOrganization.trim();
    out.billedToOrganization = trimmed ? trimmed.slice(0, 200) : null;
  }

  if (body.billingAddress === null) {
    out.billingAddress = null;
  } else if (typeof body.billingAddress === "string") {
    // Allow newlines for multi-line addresses; cap to keep doc size sane.
    const trimmed = body.billingAddress.trim();
    out.billingAddress = trimmed ? trimmed.slice(0, 1_000) : null;
  }

  if (body.validUntilDateString === null) {
    out.validUntil = null;
  } else if (
    typeof body.validUntilDateString === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.validUntilDateString)
  ) {
    // Treat the picked date as end-of-day local time. Convert to an
    // admin Timestamp so the cast to the Quote type (which uses client
    // SDK's Timestamp) is structurally honest — admin + client
    // Timestamps share the same shape at runtime, TS just treats them
    // as different nominal types.
    const d = new Date(`${body.validUntilDateString}T23:59:59`);
    if (!Number.isNaN(d.getTime())) {
      out.validUntil = Timestamp.fromDate(d) as unknown as Quote["validUntil"];
    }
  }

  if (typeof body.autoCreateDealOnAccept === "boolean") {
    out.autoCreateDealOnAccept = body.autoCreateDealOnAccept;
  }

  if (body.paymentDueDays === null) {
    out.paymentDueDays = null;
  } else if (
    typeof body.paymentDueDays === "number" &&
    Number.isFinite(body.paymentDueDays) &&
    body.paymentDueDays >= 0 &&
    body.paymentDueDays <= 365
  ) {
    out.paymentDueDays = Math.round(body.paymentDueDays);
  }

  return out;
}

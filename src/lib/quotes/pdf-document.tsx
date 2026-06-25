import "server-only";

import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { formatCurrency } from "@/lib/format";
import type { Quote } from "@/types/quotes";

/**
 * React-PDF document for a quote or invoice. Kept deliberately simple
 * (no logos, no fancy theming) so any sub-account's brand renders
 * neutrally — we surface the business name + invoice/quote number and
 * let the line items + totals do the talking.
 *
 * Used by both the operator's authenticated PDF route and the
 * recipient's token-gated public PDF route — same renderer, different
 * auth gate.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a22",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8ec",
  },
  headerLeft: {
    flexDirection: "column",
  },
  headerLogo: {
    maxHeight: 40,
    maxWidth: 160,
    marginBottom: 8,
    objectFit: "contain",
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  kindLabel: {
    fontSize: 9,
    color: "#6b6b75",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  kindLabelInvoice: {
    color: "#0a8a55",
  },
  businessName: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: "Helvetica-Bold",
  },
  docNumber: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
  },
  metaLine: {
    fontSize: 9,
    color: "#6b6b75",
    marginTop: 2,
  },
  metaSection: {
    flexDirection: "row",
    marginTop: 24,
    gap: 32,
  },
  metaBlock: {
    flex: 1,
  },
  metaBlockLabel: {
    fontSize: 8,
    color: "#6b6b75",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  metaBlockValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
  },
  metaBlockAddress: {
    fontSize: 9,
    color: "#6b6b75",
    marginTop: 3,
    lineHeight: 1.4,
  },
  tableHeader: {
    flexDirection: "row",
    marginTop: 28,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a22",
  },
  th: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  thDescription: { flex: 4 },
  thQty: { width: 40, textAlign: "right" },
  thPrice: { width: 70, textAlign: "right" },
  thTotal: { width: 70, textAlign: "right" },
  row: {
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e8e8ec",
  },
  cellDescription: { flex: 4, fontSize: 10 },
  cellQty: { width: 40, fontSize: 10, textAlign: "right" },
  cellPrice: { width: 70, fontSize: 10, textAlign: "right" },
  cellTotal: { width: 70, fontSize: 10, textAlign: "right" },
  totalsBlock: {
    marginTop: 16,
    flexDirection: "column",
    alignItems: "flex-end",
  },
  totalsRow: {
    flexDirection: "row",
    width: 220,
    paddingVertical: 3,
  },
  totalsLabel: {
    flex: 1,
    fontSize: 10,
    color: "#6b6b75",
  },
  totalsValue: {
    fontSize: 10,
    textAlign: "right",
  },
  totalsRule: {
    width: 220,
    borderTopWidth: 0.5,
    borderTopColor: "#1a1a22",
    marginTop: 4,
    marginBottom: 4,
  },
  totalRowFinal: {
    flexDirection: "row",
    width: 220,
    paddingVertical: 4,
  },
  totalLabelFinal: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
  },
  totalValueFinal: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
    textAlign: "right",
  },
  termsSection: {
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: "#e8e8ec",
  },
  termsLabel: {
    fontSize: 8,
    color: "#6b6b75",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  termsText: {
    fontSize: 10,
    lineHeight: 1.5,
    color: "#1a1a22",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#9a9aa3",
    textAlign: "center",
  },
});

interface InvoicePdfProps {
  quote: Quote;
  businessName: string;
  /** Optional sub-account logo (public https URL). When present, renders
   *  above the business name in the header. */
  businessLogoUrl?: string | null;
  recipientName: string;
  /** ISO date string for "Issued" line. Defaults to today. */
  issuedDateLabel?: string;
}

export function InvoicePdfDocument({
  quote,
  businessName,
  businessLogoUrl,
  recipientName,
  issuedDateLabel,
}: InvoicePdfProps) {
  const safeLogoUrl =
    typeof businessLogoUrl === "string" &&
    /^https?:\/\/.+/i.test(businessLogoUrl)
      ? businessLogoUrl
      : null;
  const isInvoice = quote.kind === "invoice";
  const docLabel = isInvoice ? "INVOICE" : "QUOTE";
  const totals = computeQuoteTotals(quote);
  const issued = issuedDateLabel ?? new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const dueLine = isInvoice
    ? formatPaymentDueLabel(quote.paymentDueDays)
    : validUntilLabel(quote.validUntil);

  return (
    <Document
      title={`${docLabel} ${quote.quoteNumber}`}
      author={businessName}
      subject={`${docLabel} ${quote.quoteNumber} from ${businessName}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {safeLogoUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.headerLogo} src={safeLogoUrl} />
            )}
            <Text
              style={
                isInvoice
                  ? [styles.kindLabel, styles.kindLabelInvoice]
                  : styles.kindLabel
              }
            >
              {docLabel} {quote.quoteNumber}
            </Text>
            <Text style={styles.businessName}>{businessName}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docNumber}>{quote.quoteNumber}</Text>
            <Text style={styles.metaLine}>Issued {issued}</Text>
            {dueLine && <Text style={styles.metaLine}>{dueLine}</Text>}
          </View>
        </View>

        {/* Recipient / billed-to */}
        <View style={styles.metaSection}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaBlockLabel}>Recipient</Text>
            <Text style={styles.metaBlockValue}>
              {recipientName || "—"}
            </Text>
          </View>
          {(quote.billedToOrganization || quote.billingAddress) && (
            <View style={styles.metaBlock}>
              <Text style={styles.metaBlockLabel}>
                {isInvoice ? "Billed to" : "Prepared for"}
              </Text>
              {quote.billedToOrganization && (
                <Text style={styles.metaBlockValue}>
                  {quote.billedToOrganization}
                </Text>
              )}
              {quote.billingAddress && (
                <Text style={styles.metaBlockAddress}>
                  {quote.billingAddress}
                </Text>
              )}
            </View>
          )}
          <View style={styles.metaBlock}>
            <Text style={styles.metaBlockLabel}>Currency</Text>
            <Text style={styles.metaBlockValue}>{quote.currency}</Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.thDescription]}>Description</Text>
          <Text style={[styles.th, styles.thQty]}>Qty</Text>
          <Text style={[styles.th, styles.thPrice]}>Unit price</Text>
          <Text style={[styles.th, styles.thTotal]}>Total</Text>
        </View>
        {quote.lineItems.map((item) => {
          const lineTotal =
            (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
          return (
            <View key={item.id} style={styles.row} wrap={false}>
              <Text style={styles.cellDescription}>
                {item.description || "Untitled item"}
              </Text>
              <Text style={styles.cellQty}>{item.quantity}</Text>
              <Text style={styles.cellPrice}>
                {formatCurrency(item.unitPrice, quote.currency)}
              </Text>
              <Text style={styles.cellTotal}>
                {formatCurrency(lineTotal, quote.currency)}
              </Text>
            </View>
          );
        })}

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>
              {formatCurrency(totals.subtotal, quote.currency)}
            </Text>
          </View>
          {totals.discountAmount > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Discount</Text>
              <Text style={styles.totalsValue}>
                − {formatCurrency(totals.discountAmount, quote.currency)}
              </Text>
            </View>
          )}
          {totals.taxAmount > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                Tax ({quote.globalTaxPercent ?? 0}%)
              </Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(totals.taxAmount, quote.currency)}
              </Text>
            </View>
          )}
          <View style={styles.totalsRule} />
          <View style={styles.totalRowFinal}>
            <Text style={styles.totalLabelFinal}>Total</Text>
            <Text style={styles.totalValueFinal}>
              {formatCurrency(totals.total, quote.currency)}
            </Text>
          </View>
        </View>

        {/* Terms */}
        {quote.termsAndNotes?.trim() && (
          <View style={styles.termsSection}>
            <Text style={styles.termsLabel}>Terms &amp; notes</Text>
            <Text style={styles.termsText}>{quote.termsAndNotes}</Text>
          </View>
        )}

        <Text style={styles.footer} fixed>
          {businessName} · {docLabel.toLowerCase()} {quote.quoteNumber}
        </Text>
      </Page>
    </Document>
  );
}

function formatPaymentDueLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 0) return "Payment due on receipt";
  if (days === 1) return "Payment due within 1 day";
  return `Payment due within ${days} days`;
}

function validUntilLabel(validUntil: Quote["validUntil"]): string | null {
  if (!validUntil) return null;
  if (
    typeof validUntil === "object" &&
    "toDate" in validUntil &&
    typeof (validUntil as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (validUntil as { toDate: () => Date }).toDate();
    return `Valid until ${d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }
  return null;
}

import "server-only";

import { renderToStream } from "@react-pdf/renderer";
import { InvoicePdfDocument } from "@/lib/quotes/pdf-document";
import type { Quote } from "@/types/quotes";

/**
 * Streams a Quote/Invoice as a PDF. Returns a Web ReadableStream
 * suitable for `new NextResponse(stream, { ... })`.
 *
 * @react-pdf/renderer's renderToStream returns a Node Readable; we wrap
 * it via Readable.toWeb so Next's NextResponse / fetch contracts are
 * happy under all runtimes.
 */
export async function renderQuotePdfStream({
  quote,
  businessName,
  businessLogoUrl,
  recipientName,
}: {
  quote: Quote;
  businessName: string;
  businessLogoUrl?: string | null;
  recipientName: string;
}): Promise<ReadableStream<Uint8Array>> {
  const nodeStream = await renderToStream(
    <InvoicePdfDocument
      quote={quote}
      businessName={businessName}
      businessLogoUrl={businessLogoUrl}
      recipientName={recipientName}
    />,
  );
  // Node Readable → Web ReadableStream so NextResponse can consume it
  // identically regardless of runtime.
  const { Readable } = await import("node:stream");
  return Readable.toWeb(
    nodeStream as unknown as InstanceType<typeof Readable>,
  ) as ReadableStream<Uint8Array>;
}

export function pdfFilename(quote: Pick<Quote, "kind" | "quoteNumber">): string {
  const safe = quote.quoteNumber.replace(/[^A-Za-z0-9_-]+/g, "_");
  return `${safe}.pdf`;
}

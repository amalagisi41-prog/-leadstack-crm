import type { ListingMarketingStatus } from "@/types/idx";

/**
 * Turn a scraped public listings page into property cards.
 *
 * Calibrated against the plain-text layout a listings grid actually renders
 * as (status · city, a one-line description, "address · City, State", a
 * blank line, then the price) — the same shape Firecrawl's markdown mode
 * produces for this kind of page in every case checked so far. This
 * environment cannot reach an arbitrary buyer's live site to verify every
 * possible rendering (a pipe-table layout, a bullet list, headings instead
 * of plain lines), so an unusual page may parse to zero cards rather than
 * something wrong: `parseListingsFromMarkdown` never guesses a card out of
 * a line it cannot confidently attribute, and the caller treats zero cards
 * as a failure to report, not a quiet empty sync.
 */

export interface ScrapedListingCard {
  address: string;
  city: string;
  state: string;
  price: number;
  marketingStatus: ListingMarketingStatus;
  /** Extra words from the status line beyond the status itself (e.g. "Probate", "As-is"). */
  tags: string[];
  remarks: string;
}

const STATUS_PATTERN =
  /^(for sale|under contract|pending|sold|off market|coming soon)\b/i;

const STATUS_TO_MARKETING: Record<string, ListingMarketingStatus> = {
  "for sale": "active",
  "coming soon": "new",
  pending: "under-contract",
  "under contract": "under-contract",
  sold: "just-sold",
  "off market": "off-market",
};

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC",
};

/** "Connecticut" -> "CT"; already-abbreviated or unrecognized values pass through untouched. */
function stateAbbreviation(value: string): string {
  const trimmed = value.trim();
  return STATE_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

function parsePrice(line: string): number | null {
  const match = line.match(/\$\s*([\d,]+)/);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** "29 Division Street West #3 · Greenwich, Connecticut" -> address/city/state. */
function parseAddressLine(
  line: string,
): { address: string; city: string; state: string } | null {
  const [addressPart, locationPart] = line.split("·").map((part) => part.trim());
  if (!addressPart || !locationPart) return null;
  const location = locationPart.match(/^(.+?),\s*(.+)$/);
  if (!location) return null;
  const [, city, state] = location;
  if (!city.trim() || !state.trim()) return null;
  return {
    address: addressPart,
    city: city.trim(),
    state: stateAbbreviation(state),
  };
}

/** One property's status line -> its marketing status plus any extra tags. */
function parseStatusLine(
  line: string,
): { marketingStatus: ListingMarketingStatus; tags: string[] } | null {
  const segments = line.split("·").map((part) => part.trim());
  const first = segments[0]?.toLowerCase();
  const marketingStatus = first ? STATUS_TO_MARKETING[first] : undefined;
  if (!marketingStatus) return null;
  return { marketingStatus, tags: segments.slice(1).filter(Boolean) };
}

/**
 * Split the page into per-property blocks anchored on each status line
 * ("For sale · …"), then pull the address line and price out of each block.
 * A blank line inside a card (between the address and the price, in every
 * page checked so far) is not a card boundary — only a new status line is.
 */
export function parseListingsFromMarkdown(markdown: string): ScrapedListingCard[] {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const anchors: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (STATUS_PATTERN.test(lines[i])) anchors.push(i);
  }

  const cards: ScrapedListingCard[] = [];
  for (let a = 0; a < anchors.length; a++) {
    const start = anchors[a];
    const end = a + 1 < anchors.length ? anchors[a + 1] : lines.length;
    const block = lines.slice(start, end);

    const status = parseStatusLine(block[0]);
    if (!status) continue;

    const addressLine = block.find((line) => parseAddressLine(line) !== null);
    const location = addressLine ? parseAddressLine(addressLine) : null;
    if (!location) continue;

    const priceLine = block.find((line) => parsePrice(line) !== null);
    const price = priceLine ? parsePrice(priceLine) : null;
    if (price === null) continue;

    // Everything between the status line and the address line, excluding
    // both, reads as the card's one-line marketing description.
    const addressIndex = block.indexOf(addressLine!);
    const remarks = block.slice(1, addressIndex).join(" ").trim();

    cards.push({
      address: location.address,
      city: location.city,
      state: location.state,
      price,
      marketingStatus: status.marketingStatus,
      tags: status.tags,
      remarks,
    });
  }
  return cards;
}

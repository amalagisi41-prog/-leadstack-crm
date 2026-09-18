/**
 * RPR (Realtors Property Resource) deep-link helper.
 *
 * RPR's API is unusable for third-party platforms — SOAP/XML, MLS-only, and
 * its terms of service prohibit redistributing RPR data. The only legitimate
 * integration is sending the agent into their OWN RPR portal via their
 * MLS-SSO session; we never fetch or store RPR data ourselves.
 *
 * Per-property links go through RPR's own Deep Links feature, NOT through
 * the internal property id in `/properties/details/info/{rprInternalId}`.
 * That internal id is unobtainable (a fabricated one 404s — verified against
 * a live SmartMLS/RPR session), which is why this module previously did no
 * per-property linking at all and made the agent paste an address into RPR's
 * search box. That was wrong about RPR, not just awkward: RPR publishes a
 * documented deep-link endpoint that takes an MLS listing number or a full
 * address and resolves the internal id on its own side.
 *
 * Evidence this is built on, since RPR is unreachable from CI and from this
 * repo's build environment (egress-blocked), so none of it is a live check:
 *
 *   - RPR's own deep-link builder emits exactly this URL shape, keys and all:
 *     `https://narrpr.com/deep-link?apn=&cbcode=…&detailstab=&fips=&listingid=
 *      &orgid=&query=3433+Moulton+Ave%2C+Cincinnati%2C+OH+45205&reporttype=
 *      &resulttype=&searchtype=Properties&ssocode=`
 *   - RPR's MLS deep-link documentation describes filling `query`
 *     dynamically with a full address including city, state and ZIP, and
 *     lists Property/Listing Details among the linkable destinations.
 *     (blog.narrpr.com/mls/rpr-deep-links, support.narrpr.com "Deep Linking")
 *
 * So `buildRprPropertyUrl()` is built to a documented contract that has not
 * been exercised end-to-end from here. `RprLinkButton` therefore still puts
 * the address on the clipboard: if a deep link ever lands on RPR's search
 * rather than the property, the agent is one paste from where they were
 * going instead of stranded.
 */

/**
 * RPR org/board codes look like SmartMLS's `ctconnm-n` — lowercase letters,
 * digits, and hyphens, roughly 2-40 characters. This is RPR's own MLS-SSO
 * identifier baked into their public URLs, not a credential.
 */
export const RPR_ORG_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function isValidRprOrgId(value: string): boolean {
  return RPR_ORG_ID_RE.test(value);
}

/**
 * Pull the org/board code out of whatever the agent actually has in front of
 * them. Finding this value means being signed into RPR and looking at its
 * URL — so the thing on their clipboard is a whole URL, not a bare code.
 * Asking them to hand-extract one query parameter from it is handing them a
 * task to get wrong ("never ask the user for something the app can find
 * out", CLAUDE.md), and it did: a pasted
 * `narrpr.com/home?cbcode=ctconnm-n&listingid=…&pmode=1&LocationType=4`
 * was rejected as "that doesn't look like an RPR org code".
 *
 * Accepts, in order of what shows up in practice:
 *   - a bare code                  → `ctconnm-n`
 *   - the SSO entry URL            → `narrpr.com/home?cbcode=ctconnm-n&…`
 *   - a full property URL          → `https://www.narrpr.com/properties/details/info/78418177?orgid=ctconnm`
 *   - any of the above mis-cased   → `CTCONNM-N`
 *
 * `cbcode` wins over `orgid` when both appear: `cbcode` is the MLS-SSO
 * entry parameter this feature actually builds links with, and the two
 * carry different values on RPR's own URLs (`cbcode=ctconnm-n` vs
 * `orgid=ctconnm`). Returns null when nothing valid is present, so callers
 * keep rejecting genuine garbage rather than silently storing it.
 */
export function parseRprOrgId(input: string): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return null;

  // A query string anywhere in the input means we were handed a URL. Parse
  // by hand rather than with `new URL()` — the value is routinely pasted
  // without a scheme ("narrpr.com/home?..."), which `new URL()` rejects.
  const queryStart = trimmed.indexOf("?");
  if (queryStart !== -1) {
    const params = new URLSearchParams(trimmed.slice(queryStart + 1));
    for (const key of ["cbcode", "orgid"]) {
      const value = params.get(key)?.trim().toLowerCase();
      if (value && isValidRprOrgId(value)) return value;
    }
    return null;
  }

  const candidate = trimmed.toLowerCase();
  return isValidRprOrgId(candidate) ? candidate : null;
}

/**
 * RPR's verified MLS-SSO entry point for a given board. Lands the agent on
 * their own RPR home page via their SmartMLS/connectMLS SSO session — the
 * same URL confirmed live against a real SmartMLS→RPR federation.
 */
export function buildRprHomeUrl(rprOrgId: string): string {
  return `https://www.narrpr.com/home?cbcode=${encodeURIComponent(rprOrgId)}`;
}

/**
 * RPR's deep-link endpoint. No `www.` — this is the host RPR's own
 * deep-link builder emits, and it is a different path from the `www.…/home`
 * SSO entry above.
 */
export const RPR_DEEP_LINK_BASE = "https://narrpr.com/deep-link";

/**
 * A link straight to one property inside the agent's own RPR account.
 *
 * Two ways in, preferred in this order:
 *
 *   1. **MLS listing number** (`listingid`) — exact, and it is the identifier
 *      RPR's MLS deep-link integration is designed around. Our listings come
 *      from the MLS feed, so `IdxListingDoc.mlsId` is that number.
 *   2. **Full address** (`query` + `searchtype=Properties`) — RPR's docs are
 *      explicit that the address must carry city and state (ZIP too where we
 *      have it), so a partial address is not offered at all; a bare street
 *      line would resolve to the wrong town.
 *
 * Returns null when neither is available, which is the caller's signal to
 * fall back to `buildRprHomeUrl()` rather than to emit a link that cannot
 * resolve. RPR still asks for a sign-in when the agent has no live session —
 * `cbcode` is what makes that their MLS's SSO prompt rather than a dead end.
 */
export function buildRprPropertyUrl(fields: {
  rprOrgId: string;
  mlsId?: string | null;
  address: string;
  city: string;
  state: string;
  zip?: string | null;
}): string | null {
  const params = new URLSearchParams({ cbcode: fields.rprOrgId });

  const mlsId = fields.mlsId?.trim();
  if (mlsId) {
    params.set("listingid", mlsId);
    return `${RPR_DEEP_LINK_BASE}?${params.toString()}`;
  }

  const hasPlaceableAddress =
    !!fields.address.trim() && !!fields.city.trim() && !!fields.state.trim();
  if (!hasPlaceableAddress) return null;

  params.set("query", formatAddressForRpr(fields));
  params.set("searchtype", "Properties");
  return `${RPR_DEEP_LINK_BASE}?${params.toString()}`;
}

/**
 * Full postal address for pasting into RPR's own property search box.
 * RPR's search expects a single line like "123 Main St, Stamford, CT 06902"
 * — matches the format confirmed against RPR's live search UI.
 */
export function formatAddressForRpr(fields: {
  address: string;
  city: string;
  state: string;
  zip?: string | null;
}): string {
  const line2 = [fields.city, fields.state].filter(Boolean).join(", ");
  const zip = fields.zip?.trim();
  return [fields.address, zip ? `${line2} ${zip}` : line2]
    .filter((part) => part && part.trim())
    .join(", ");
}

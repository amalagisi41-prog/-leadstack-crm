/**
 * RPR (Realtors Property Resource) deep-link helper.
 *
 * RPR's API is unusable for third-party platforms — SOAP/XML, MLS-only, and
 * its terms of service prohibit redistributing RPR data. The only legitimate
 * integration is sending the agent into their OWN RPR portal via their
 * MLS-SSO session; we never fetch or store RPR data ourselves.
 *
 * What this module does NOT do: build a per-property link. RPR resolves
 * every property page through its own internal property id
 * (`/properties/details/info/{rprInternalId}`), which we have no legitimate
 * way to obtain — RPR 404s if you swap in a placeholder id, and an address
 * search still resolves through that same internal id rather than exposing
 * an intermediate, linkable results page (verified against a live SmartMLS/
 * RPR session before writing this). So the honest, buildable action is: open
 * RPR's real MLS-SSO entry point, scoped to the agent's own MLS board via
 * `orgId`, and hand the agent the property address to paste into RPR's own
 * search box.
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

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
 * RPR's verified MLS-SSO entry point for a given board. Lands the agent on
 * their own RPR home page via their SmartMLS/connectMLS SSO session — the
 * same URL confirmed live against a real SmartMLS→RPR federation.
 */
export function buildRprHomeUrl(rprOrgId: string): string {
  return `https://www.narrpr.com/home?cbcode=${encodeURIComponent(rprOrgId)}`;
}

/**
 * Full postal address for pasting into RPR's own property search box.
 * RPR's search expects a single line like "303 Weed Ave, Stamford, CT 06902"
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

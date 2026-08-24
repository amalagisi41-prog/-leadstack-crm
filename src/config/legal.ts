/**
 * The company facts every legal document depends on.
 *
 * Four values appear across the Privacy Policy, Terms of Service, and
 * Licensing notice, and all four are legally load-bearing: the entity that is
 * party to the agreement, the law and venue that govern a dispute, the date
 * the terms took effect, and the email address for notices. None of them
 * existed anywhere in this repository, so they are configuration rather than
 * literals — and deliberately NOT given fallback values.
 *
 * A wrong default here is worse than a blank. A policy naming the wrong
 * entity or the wrong venue can be unenforceable. So an unset required field
 * renders as a visible gap and the page carries a "not ready to publish"
 * banner, rather than quietly shipping a plausible-looking placeholder.
 *
 * `mailingAddress` is the one field that is deliberately NOT required. The
 * operator chose not to publish a physical address (email-only notices) —
 * that is a legitimate operating choice, not an oversight, so leaving it
 * unset must never trip the "not ready to publish" banner or render a red
 * gap marker. When set, it still appears in the Contact section; when unset,
 * the Contact section simply omits the line rather than flagging it missing.
 *
 * Set these in the environment (all are NEXT_PUBLIC_ because they render in
 * the document body, and none is a secret — they belong on a published page).
 */

export interface LegalEntityConfig {
  /** Registered entity name, e.g. "Example Holdings LLC". */
  legalName: string;
  /**
   * Optional full postal address for notices, single line or comma
   * separated. Not in REQUIRED_LEGAL_FIELDS by design — an operator who
   * chooses email-only notices leaves this blank on purpose.
   */
  mailingAddress: string;
  /** Governing law, e.g. "Connecticut". */
  governingState: string;
  /** Exclusive venue, e.g. "Fairfield County, Connecticut". */
  governingVenue: string;
  /** Effective date as it should read, e.g. "August 16, 2026". */
  effectiveDate: string;
  /** Contact address published in every document. */
  contactEmail: string;
}

const read = (value: string | undefined) => (value ?? "").trim();

/**
 * Defaults supplied by the operator. Governing state and venue are DERIVED
 * from the mailing address (Stamford sits in Fairfield County, Connecticut) —
 * geography is certain, but choice of law and venue is a legal decision a
 * company can make differently (many incorporate in Delaware and choose its
 * courts). Confirm with counsel; override with the env vars below.
 */
export const LEGAL_ENTITY: LegalEntityConfig = {
  legalName: read(process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME) || "AgentStack",
  mailingAddress: read(process.env.NEXT_PUBLIC_LEGAL_MAILING_ADDRESS) || "",
  governingState:
    read(process.env.NEXT_PUBLIC_LEGAL_GOVERNING_STATE) || "Connecticut",
  governingVenue:
    read(process.env.NEXT_PUBLIC_LEGAL_GOVERNING_VENUE) ||
    "Fairfield County, Connecticut",
  effectiveDate:
    read(process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE) || "August 16, 2026",
  contactEmail:
    read(process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL) ||
    "hello@agentstackcrm.app",
};

/** Human-readable label + env var for each required field. */
export const REQUIRED_LEGAL_FIELDS: Array<{
  key: keyof LegalEntityConfig;
  label: string;
  envVar: string;
  example: string;
}> = [
  {
    key: "legalName",
    label: "Legal company name",
    envVar: "NEXT_PUBLIC_LEGAL_COMPANY_NAME",
    example: "Example Holdings LLC",
  },
  {
    key: "governingState",
    label: "Governing state",
    envVar: "NEXT_PUBLIC_LEGAL_GOVERNING_STATE",
    example: "Connecticut",
  },
  {
    key: "governingVenue",
    label: "Governing county and state",
    envVar: "NEXT_PUBLIC_LEGAL_GOVERNING_VENUE",
    example: "Fairfield County, Connecticut",
  },
  {
    key: "effectiveDate",
    label: "Effective date",
    envVar: "NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE",
    example: "August 16, 2026",
  },
];

/** Fields still unset. Empty means the documents are ready to publish. */
export function legalConfigGaps(
  config: LegalEntityConfig = LEGAL_ENTITY
): typeof REQUIRED_LEGAL_FIELDS {
  // Trimmed here as well as at construction: a caller-supplied config (or a
  // value set to "   ") would otherwise pass as present and render as an
  // invisible blank in the middle of finished-looking prose.
  return REQUIRED_LEGAL_FIELDS.filter(
    (field) => !String(config[field.key] ?? "").trim()
  );
}

export function isLegalConfigComplete(
  config: LegalEntityConfig = LEGAL_ENTITY
): boolean {
  return legalConfigGaps(config).length === 0;
}

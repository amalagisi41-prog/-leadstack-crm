import "server-only";

/**
 * Pluggable third-party compliance/scrub seam for outbound calling.
 *
 * LeadStack's native compliance gate (outbound-compliance.ts) enforces
 * everything we can do without an external service — opt-out, consent,
 * timezone calling window, rate + per-number frequency caps. A buyer can
 * be located anywhere in the world, so we deliberately do NOT hard-wire
 * any region-specific scrubbing vendor.
 *
 * This interface is the extension point for buyers who DO want to add a
 * regional scrubber — US DNC / litigator / reassigned-number (e.g.
 * dnc.com, The Blacklist Alliance), an AU DNCR "washing" service, etc.
 * Implement the interface, register it in `getComplianceProvider()`, and
 * select it via the OUTBOUND_COMPLIANCE_PROVIDER env var. No adapter
 * ships by default — the seam is here so adding one later is a localized
 * change, not a gate rewrite.
 */
export interface ComplianceProvider {
  /**
   * Screen a single E.164 number. Resolve `{ allowed: false, reasons }`
   * to BLOCK the call (the gate surfaces the reasons). Must fail-safe per
   * the implementer's policy — a network error should typically resolve
   * `allowed: true` so a scrubber outage doesn't halt all calling, unless
   * the buyer's compliance posture requires fail-closed.
   */
  scrub(e164: string): Promise<{ allowed: boolean; reasons: string[] }>;
}

/** Default: always allows. Native gate still runs — this only no-ops the
 *  *external* scrub step so nothing is required out of the box. */
export const NoopComplianceProvider: ComplianceProvider = {
  async scrub() {
    return { allowed: true, reasons: [] };
  },
};

/**
 * Returns the active provider. Today only "noop" is wired. To add a real
 * vendor: implement ComplianceProvider in a sibling file (e.g.
 * `compliance-dnc.ts`), then branch here on the env value. Keeping the
 * factory the single switch point means the gate never imports a vendor
 * SDK directly.
 */
export function getComplianceProvider(): ComplianceProvider {
  const which = process.env.OUTBOUND_COMPLIANCE_PROVIDER?.trim().toLowerCase();
  switch (which) {
    // case "dnc": return DncComplianceProvider;        // TODO: US DNC/litigator/reassigned
    // case "au-dncr": return AuDncrComplianceProvider;  // TODO: AU Do Not Call Register washing
    default:
      return NoopComplianceProvider;
  }
}

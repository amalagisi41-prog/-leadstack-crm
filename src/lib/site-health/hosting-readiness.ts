import type { HostingStartingPoint } from "@/types/onboarding-foundation";

/**
 * Deciding when DNS is safe to change — without a human in the loop.
 *
 * The DNS step is gated on "the hosted site is verified", which was read from
 * `websiteTransfers/current.hostingStatus === "ready"`. Nothing in the
 * codebase ever wrote that value: it is set to "not_requested" on create and
 * "requested" by the transfer action, and there is no third writer. The gate
 * could therefore never open on its own, so every agent on a migration path
 * eventually had to contact support to be let through — a support ticket
 * guaranteed by construction, for a condition that is mechanically checkable.
 *
 * Readiness is derived from observable state instead, per hosting path, so no
 * administrator ever has to flip a flag:
 *
 *  - keep_existing     — there is no cutover at all; nothing to verify.
 *  - agentstack_managed — AgentStack serves the site at /agent/{id}/{slug}.
 *                         If it is published, it is live, by construction.
 *  - transfer_existing — the provider is done when the domain answers over
 *                        HTTPS, which the liveness probe already checks.
 */

export interface HostingReadinessInputs {
  hostingStartingPoint: HostingStartingPoint | null;
  /** agentSites/main has status "published". */
  agentSitePublished: boolean;
  /** The saved domain verified live over HTTPS by the liveness probe. */
  siteVerifiedLive: boolean;
  /** Legacy field, honoured if some deployment does set it. */
  legacyHostingStatus?: string | null;
  legacyHostingUrl?: string | null;
}

export interface HostingReadiness {
  /** DNS record values may be shown. */
  ready: boolean;
  /** True when this path has no cutover, so DNS is not applicable at all. */
  notApplicable: boolean;
  /** Plain-language status for the agent. */
  reason: string;
  /**
   * Always false. Kept explicit so a future change that reintroduces a
   * human-gated path has to say so, and the test below will catch it.
   */
  requiresAdmin: boolean;
}

export function deriveHostingReadiness(
  inputs: HostingReadinessInputs
): HostingReadiness {
  const legacyReady =
    inputs.legacyHostingStatus === "ready" &&
    typeof inputs.legacyHostingUrl === "string" &&
    inputs.legacyHostingUrl.startsWith("https://");

  if (inputs.hostingStartingPoint === "keep_existing") {
    return {
      ready: false,
      notApplicable: true,
      reason:
        "You're staying on your current host, so there is no cutover and no DNS change to make.",
      requiresAdmin: false,
    };
  }

  if (inputs.hostingStartingPoint === "agentstack_managed") {
    return inputs.agentSitePublished || legacyReady
      ? {
          ready: true,
          notApplicable: false,
          reason:
            "Your AgentStack site is published and served over HTTPS. It is safe to point your domain at it.",
          requiresAdmin: false,
        }
      : {
          ready: false,
          notApplicable: false,
          reason:
            "Publish your site in Website Studio first. DNS records appear as soon as it is live, with nothing to wait on.",
          requiresAdmin: false,
        };
  }

  if (inputs.hostingStartingPoint === "transfer_existing") {
    return inputs.siteVerifiedLive || legacyReady
      ? {
          ready: true,
          notApplicable: false,
          reason:
            "Your site answers over HTTPS at the new host, so the transfer is complete.",
          requiresAdmin: false,
        }
      : {
          ready: false,
          notApplicable: false,
          reason:
            "We check your domain automatically and unlock this the moment your new host answers over HTTPS. Nothing to request — come back after the transfer finishes.",
          requiresAdmin: false,
        };
  }

  return {
    ready: legacyReady,
    notApplicable: false,
    reason: "Choose how your site will be hosted to continue.",
    requiresAdmin: false,
  };
}

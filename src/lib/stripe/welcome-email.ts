import "server-only";

interface WelcomeEmailParams {
  to: string;
  affiliateCode?: string | null;
  claimUrl?: string | null;
  gitpageAgencyCode?: string | null;
}

// Stub — the real welcome-email sender is LeadStack-marketing-specific.
// Kept as a typed no-op so `webhooks.ts` still type-checks; the founders
// branch of the webhook is gated on metadata.kind === "founders", which
// the custom checkout flow never sets, so this is never called at runtime.
export async function sendFoundersWelcomeEmail(
  _params: WelcomeEmailParams,
): Promise<string | null> {
  return null;
}

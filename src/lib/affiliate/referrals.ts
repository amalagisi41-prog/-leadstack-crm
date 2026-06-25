import "server-only";

interface CreateReferralInput {
  refCode: string;
  purchaseSessionId: string;
  buyerEmail: string;
  amountPaidCents: number | null;
}

type CreateReferralOutcome =
  | { status: "credited"; referralId: string; commissionCents: number }
  | { status: "skipped"; reason: string };

// Stub — see publish/README.md. Never called at runtime in the buyer's
// clone (gated upstream by LANDING_VARIANT === "leadstack" in the Stripe
// webhook), but kept typed so webhooks.ts still type-checks.
export async function createReferral(
  _input: CreateReferralInput,
): Promise<CreateReferralOutcome> {
  return { status: "skipped", reason: "disabled" };
}

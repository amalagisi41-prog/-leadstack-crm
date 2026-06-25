import "server-only";

import type { Affiliate } from "@/types/affiliate";

interface EnsureAccountInput {
  email: string;
  displayName?: string | null;
}

// Stub — the real affiliate-account logic is LeadStack-marketing-specific.
// All three exports are typed no-ops so `webhooks.ts` still type-checks;
// the affiliate branch of the webhook is gated on
// LANDING_VARIANT === "leadstack", which the buyer never sets, so these
// are never called at runtime.

const STUB_AFFILIATE: Affiliate = {
  id: "stub",
  email: "stub@example.com",
  code: "STUB",
  displayName: null,
  status: "active",
  commissionPct: 0,
  referralCount: 0,
  pendingCommissionCents: 0,
  paidCommissionCents: 0,
  createdAt: null,
  updatedAt: null,
};

export async function ensureAffiliateAccount(
  _input: EnsureAccountInput,
): Promise<Affiliate> {
  return STUB_AFFILIATE;
}

export async function findAffiliateByCode(
  _code: string,
): Promise<Affiliate | null> {
  return null;
}

export async function findAffiliateByEmail(
  _email: string,
): Promise<Affiliate | null> {
  return null;
}

import type { AdAccountDoc, AdAccountPlatform } from "@/types/ad-accounts";

const PLATFORMS: AdAccountPlatform[] = ["meta", "google", "other"];

export interface CreateAdAccountPayload {
  platform?: string;
  label?: string;
  monthlySpendCents?: number;
  currency?: string;
  notes?: string;
}

export function sanitizeAdAccountPayload(
  body: CreateAdAccountPayload | Record<string, unknown>,
): Partial<AdAccountDoc> {
  const source = body as CreateAdAccountPayload;
  const out: Partial<AdAccountDoc> = {};

  if (
    typeof source.platform === "string" &&
    PLATFORMS.includes(source.platform as AdAccountPlatform)
  ) {
    out.platform = source.platform as AdAccountPlatform;
  }
  if (typeof source.label === "string") {
    out.label = source.label.trim().slice(0, 200);
  }
  if (
    typeof source.monthlySpendCents === "number" &&
    Number.isFinite(source.monthlySpendCents)
  ) {
    out.monthlySpendCents = Math.max(0, Math.round(source.monthlySpendCents));
  }
  if (typeof source.currency === "string" && source.currency.trim()) {
    out.currency = source.currency.trim().toUpperCase().slice(0, 3);
  }
  if (typeof source.notes === "string") {
    out.notes = source.notes.trim().slice(0, 2_000);
  }

  return out;
}

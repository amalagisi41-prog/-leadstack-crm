import type { Product } from "@/types/products";

export interface CreateProductPayload {
  name?: string;
  description?: string;
  unitPriceCents?: number;
  currency?: string;
  active?: boolean;
}

export function sanitizeProductPayload(
  body: CreateProductPayload | Record<string, unknown>,
): Partial<Product> {
  const source = body as CreateProductPayload;
  const out: Partial<Product> = {};

  if (typeof source.name === "string") {
    out.name = source.name.trim().slice(0, 200);
  }
  if (typeof source.description === "string") {
    out.description = source.description.trim().slice(0, 2_000);
  }
  if (
    typeof source.unitPriceCents === "number" &&
    Number.isFinite(source.unitPriceCents)
  ) {
    out.unitPriceCents = Math.max(0, Math.round(source.unitPriceCents));
  }
  if (typeof source.currency === "string" && source.currency.trim()) {
    out.currency = source.currency.trim().toUpperCase().slice(0, 3);
  }
  if (typeof source.active === "boolean") {
    out.active = source.active;
  }

  return out;
}

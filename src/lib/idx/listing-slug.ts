export function listingSlug(address: string, city: string): string {
  return `${address}-${city}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

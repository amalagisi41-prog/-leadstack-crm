import "server-only";

/**
 * Placid client — fills a listing's verified facts into a branded template
 * the operator designed once in Placid's own editor (a listing photo + price
 * + beds/baths overlay, their logo, their colors). Confirmed from Placid's
 * own docs: Bearer-token auth, one token per Placid "project", and a
 * `layers` object keyed by the template's own layer names — `{image: url}`
 * for an image layer, `{text: string}` for a text layer. Self-serve, ~$19/mo
 * entry, unlimited watermarked test renders — the cheapest of the
 * self-serve options surveyed (Templated.io, Orshot, Bannerbear), and unlike
 * AdCreative.ai/Canva's Autofill API, nothing here requires an enterprise
 * sales relationship.
 *
 * VERIFY BEFORE RELYING ON IN PRODUCTION: placid.app's docs were
 * egress-blocked from this environment when this file was written (same
 * limitation as narrpr.com, already documented elsewhere in this repo) — the
 * endpoint path below is inferred from their documented request/response
 * shape, not read directly from the reference. Confirm BASE_URL against
 * placid.app/docs/2.0/rest if a call 404s.
 */

const BASE_URL = "https://api.placid.app/api/rest";

export function placidIsConfigured(): boolean {
  return !!process.env.PLACID_API_TOKEN?.trim();
}

export class PlacidError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PlacidError";
    this.status = status;
  }
}

export interface PlacidRenderResult {
  id: string | null;
  status: "finished" | "queued" | "failed";
  imageUrl: string | null;
  error: string | null;
}

/**
 * Renders one template with the given layers. `test: true` (the default)
 * produces a free, watermarked preview — callers pass `test: false` only
 * once the operator is ready for the unwatermarked, credit-spending render.
 */
export async function renderImage(args: {
  templateId: string;
  layers: Record<string, { text: string } | { image: string }>;
  test?: boolean;
}): Promise<PlacidRenderResult> {
  const token = process.env.PLACID_API_TOKEN?.trim();
  if (!token) {
    throw new PlacidError("PLACID_API_TOKEN is not configured", 503);
  }

  const res = await fetch(`${BASE_URL}/images`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      template_uuid: args.templateId,
      layers: args.layers,
      create_now: true,
      test: args.test ?? true,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PlacidError(`Placid returned ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    image_url?: string;
  };

  const rawStatus = (json.status ?? "").toLowerCase();
  if (rawStatus === "finished" && json.image_url) {
    return { id: json.id ?? null, status: "finished", imageUrl: json.image_url, error: null };
  }
  if (rawStatus === "queued" || rawStatus === "pending") {
    return { id: json.id ?? null, status: "queued", imageUrl: null, error: null };
  }
  return {
    id: json.id ?? null,
    status: "failed",
    imageUrl: null,
    error: "Placid did not return a finished image.",
  };
}

/** Polls a previously-queued render by its Placid image id. */
export async function getRenderStatus(imageId: string): Promise<PlacidRenderResult> {
  const token = process.env.PLACID_API_TOKEN?.trim();
  if (!token) {
    throw new PlacidError("PLACID_API_TOKEN is not configured", 503);
  }

  const res = await fetch(`${BASE_URL}/images/${imageId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new PlacidError(`Placid returned ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    image_url?: string;
  };
  const rawStatus = (json.status ?? "").toLowerCase();
  if (rawStatus === "finished" && json.image_url) {
    return { id: json.id ?? imageId, status: "finished", imageUrl: json.image_url, error: null };
  }
  if (rawStatus === "queued" || rawStatus === "pending") {
    return { id: json.id ?? imageId, status: "queued", imageUrl: null, error: null };
  }
  return {
    id: json.id ?? imageId,
    status: "failed",
    imageUrl: null,
    error: "Placid did not return a finished image.",
  };
}

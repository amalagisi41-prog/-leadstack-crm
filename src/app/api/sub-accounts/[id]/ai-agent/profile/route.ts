import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAgentProfile, upsertAgentProfile } from "@/lib/comms/ai/agent";
import type { AiAgentProfile } from "@/types/ai";

function normaliseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

/**
 * Shared AI Agent profile (identity + brand voice). One per sub-account.
 * GET returns the current profile (null if never configured) so the
 * Overview page can hydrate. PATCH merges a partial onto the existing
 * doc and is admin-only.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  const profile = await getAgentProfile(id);
  return NextResponse.json({ profile });
}

function sanitisePatch(input: Record<string, unknown>): Partial<AiAgentProfile> {
  const patch: Partial<AiAgentProfile> = {};

  if ("systemPrompt" in input && typeof input.systemPrompt === "string") {
    patch.systemPrompt = input.systemPrompt.slice(0, 8000);
  }
  if ("businessName" in input && typeof input.businessName === "string") {
    patch.businessName = input.businessName.slice(0, 200);
  }
  if ("hoursStart" in input && typeof input.hoursStart === "number") {
    patch.hoursStart = Math.max(0, Math.min(23, Math.floor(input.hoursStart)));
  }
  if ("hoursEnd" in input && typeof input.hoursEnd === "number") {
    patch.hoursEnd = Math.max(0, Math.min(23, Math.floor(input.hoursEnd)));
  }
  if ("timezone" in input && typeof input.timezone === "string") {
    patch.timezone = input.timezone.slice(0, 100);
  }
  if (
    "escalationKeywords" in input &&
    Array.isArray(input.escalationKeywords)
  ) {
    patch.escalationKeywords = input.escalationKeywords
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 25);
  }
  if ("escalationNotifyEmail" in input) {
    const raw = input.escalationNotifyEmail;
    if (raw === null || raw === "") {
      patch.escalationNotifyEmail = null;
    } else if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        patch.escalationNotifyEmail = trimmed;
      }
    }
  }
  if ("websiteUrl" in input) {
    const raw = input.websiteUrl;
    if (raw === null || raw === "") {
      patch.websiteUrl = null;
    } else if (typeof raw === "string") {
      const normalised = normaliseUrl(raw);
      if (normalised) patch.websiteUrl = normalised;
    }
  }

  return patch;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const auth = await requireSubAccountAdmin(request, id);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch = sanitisePatch(body);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields in patch" },
      { status: 400 },
    );
  }

  // If the URL changed (or was cleared), drop the stale KB so the prompt
  // doesn't keep quoting the previous site. Operator re-refreshes on demand.
  if ("websiteUrl" in patch) {
    const current = await getAgentProfile(id);
    if (current?.websiteUrl !== patch.websiteUrl) {
      patch.websiteKb = null;
      patch.websiteKbFetchedAt = null;
    }
  }

  await upsertAgentProfile(id, patch);
  const updated = await getAgentProfile(id);
  return NextResponse.json({ ok: true, profile: updated });
}

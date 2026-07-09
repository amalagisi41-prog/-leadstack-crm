import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { businessProfileCompleteness } from "@/lib/business-profile/compile";
import {
  BRAND_VOICES,
  EMPTY_BUSINESS_PROFILE,
  SERVICE_SPECIALTIES,
  type BusinessProfileContent,
  type ServiceSpecialty,
  type BrandVoice,
  type BusinessFaq,
} from "@/types/business-profile";

/**
 * The Agent Business Profile (central Knowledge Base).
 *
 * GET   — return the profile content + completeness (empty defaults when
 *         never set).
 * PATCH — merge a partial content patch, coerce/validate, recompute
 *         completeness. Admin-only. Available to every sub-account (it's the
 *         foundation the whole platform references — not a paid gate).
 */

const DOC = "main";

const VALID_VOICES = new Set(BRAND_VOICES.map((v) => v.id));
const VALID_SERVICES = new Set(SERVICE_SPECIALTIES.map((s) => s.id));

const STRING_KEYS: (keyof BusinessProfileContent)[] = [
  "agentName",
  "title",
  "brokerage",
  "licenseStates",
  "licenseNumber",
  "phone",
  "email",
  "website",
  "languages",
  "serviceAreas",
  "priceRanges",
  "specialties",
  "businessHours",
  "responsePreference",
  "handoffRules",
  "escalationRules",
  "qualificationRules",
  "brokerageDisclosure",
  "optOutLanguage",
  "bio",
  "headshotUrl",
  "logoUrl",
  "buyerGuideUrl",
  "sellerGuideUrl",
  "testimonials",
  "vendors",
];

const BOOL_KEYS: (keyof BusinessProfileContent)[] = [
  "fairHousing",
  "noLegalTaxAdvice",
];

function coerce(
  current: BusinessProfileContent,
  patch: Record<string, unknown>,
): BusinessProfileContent {
  const next: BusinessProfileContent = { ...current };

  for (const key of STRING_KEYS) {
    const raw = patch[key];
    if (typeof raw === "string") {
      // Bios/testimonials can be long; cap generously to bound storage.
      (next[key] as string) = raw.slice(0, 4000);
    }
  }
  for (const key of BOOL_KEYS) {
    if (typeof patch[key] === "boolean") (next[key] as boolean) = patch[key] as boolean;
  }
  if (typeof patch.brandVoice === "string" && VALID_VOICES.has(patch.brandVoice as BrandVoice)) {
    next.brandVoice = patch.brandVoice as BrandVoice;
  }
  if (Array.isArray(patch.services)) {
    next.services = (patch.services as unknown[]).filter(
      (s): s is ServiceSpecialty =>
        typeof s === "string" && VALID_SERVICES.has(s as ServiceSpecialty),
    );
  }
  if (Array.isArray(patch.faqs)) {
    next.faqs = (patch.faqs as unknown[])
      .filter((f): f is BusinessFaq => !!f && typeof f === "object")
      .map((f) => ({
        q: String((f as BusinessFaq).q ?? "").slice(0, 300),
        a: String((f as BusinessFaq).a ?? "").slice(0, 1500),
      }))
      .filter((f) => f.q.trim() || f.a.trim())
      .slice(0, 30);
  }
  return next;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .doc(`subAccounts/${id}/businessProfile/${DOC}`)
    .get();

  if (!snap.exists) {
    return NextResponse.json({
      profile: EMPTY_BUSINESS_PROFILE,
      completeness: 0,
      exists: false,
    });
  }
  const data = snap.data() as BusinessProfileContent & { completeness?: number };
  return NextResponse.json({
    profile: data,
    completeness: data.completeness ?? businessProfileCompleteness(data),
    exists: true,
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const { uid, agencyId } = access;
  if (!agencyId) {
    return NextResponse.json({ error: "Agency not found" }, { status: 400 });
  }

  let patch: Record<string, unknown>;
  try {
    patch = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/businessProfile/${DOC}`);
  const snap = await ref.get();
  const current = snap.exists
    ? (snap.data() as BusinessProfileContent)
    : EMPTY_BUSINESS_PROFILE;

  const next = coerce(current, patch);
  const completeness = businessProfileCompleteness(next);

  await ref.set(
    {
      ...next,
      subAccountId: id,
      agencyId,
      updatedByUid: uid,
      completeness,
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, profile: next, completeness });
}

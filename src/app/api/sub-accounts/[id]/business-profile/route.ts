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
  type BusinessObjection,
  type BusinessDocument,
} from "@/types/business-profile";

/**
 * The Agent Business Profile (central Knowledge Base).
 *
 * GET   — return the profile content + completeness (empty defaults when
 *         never set).
 * PATCH — merge a partial content patch, coerce/validate, recompute
 *         completeness. Admin-only. Available to every sub-account (it's the
 *         foundation the whole platform references — not a paid gate).
 * DELETE — archive the current Blueprint and replace only that document with
 *          a clean slate. All other sub-account data remains untouched.
 */

const DOC = "main";

const VALID_VOICES = new Set(BRAND_VOICES.map((v) => v.id));
const VALID_SERVICES = new Set(SERVICE_SPECIALTIES.map((s) => s.id));

// Directory/profile links are valid import sources, but they are not the
// operator's own business website. Older importer builds accidentally stored
// them in `website`, which made the Blueprint rehydrate Zillow on every visit.
function isDirectoryProfileUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return ["zillow.com", "realtor.com", "homes.com"].some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

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
  "clientExperience",
  "idealClientProfile",
  "clientPromise",
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
  "buyerProcess",
  "sellerProcess",
  "listingCopyStyle",
  "scripts",
];

const BOOL_KEYS: (keyof BusinessProfileContent)[] = [
  "fairHousing",
  "noLegalTaxAdvice",
];

const EXAMPLE_VALUES: Partial<Record<keyof BusinessProfileContent, string[]>> =
  {
    agentName: ["Jane Agent"],
    title: ["Realtor®, Broker Associate"],
    brokerage: ["Keller Williams Metro"],
    licenseStates: ["NJ, NY"],
    licenseNumber: ["1234567"],
    phone: ["(555) 123-4567"],
    email: ["jane@brokerage.com"],
    website: ["https://janesells.com"],
    languages: ["English, Spanish"],
    testimonials: [
      "“Jane sold our home in 6 days over asking.” — The Rivers family",
    ],
    scripts: [
      "Cold-call opener: Hi, this is Jane with Keller Williams. I noticed...",
    ],
  };

function withoutExamples(
  profile: BusinessProfileContent
): BusinessProfileContent {
  const next = { ...profile };
  for (const [key, examples] of Object.entries(EXAMPLE_VALUES) as [
    keyof BusinessProfileContent,
    string[],
  ][]) {
    const value = next[key];
    if (typeof value === "string" && examples.includes(value.trim()))
      (next[key] as string) = "";
  }
  if (
    /I cannot invent these details|approved business profile provided does not contain/i.test(
      next.escalationRules
    )
  )
    next.escalationRules = "";
  if (/No preferred vendors are specified/i.test(next.vendors))
    next.vendors = "";
  return next;
}

function coerce(
  current: BusinessProfileContent,
  patch: Record<string, unknown>
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
    if (typeof patch[key] === "boolean")
      (next[key] as boolean) = patch[key] as boolean;
  }
  if (
    typeof patch.brandVoice === "string" &&
    VALID_VOICES.has(patch.brandVoice as BrandVoice)
  ) {
    next.brandVoice = patch.brandVoice as BrandVoice;
  }
  if (Array.isArray(patch.services)) {
    next.services = (patch.services as unknown[]).filter(
      (s): s is ServiceSpecialty =>
        typeof s === "string" && VALID_SERVICES.has(s as ServiceSpecialty)
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
  if (Array.isArray(patch.objections)) {
    next.objections = (patch.objections as unknown[])
      .filter((o): o is BusinessObjection => !!o && typeof o === "object")
      .map((o) => ({
        objection: String((o as BusinessObjection).objection ?? "").slice(
          0,
          300
        ),
        response: String((o as BusinessObjection).response ?? "").slice(
          0,
          1500
        ),
      }))
      .filter((o) => o.objection.trim() || o.response.trim())
      .slice(0, 30);
  }
  if (Array.isArray(patch.documents)) {
    next.documents = (patch.documents as unknown[])
      .filter((d): d is BusinessDocument => !!d && typeof d === "object")
      .map((d) => ({
        label: String((d as BusinessDocument).label ?? "").slice(0, 100),
        url: String((d as BusinessDocument).url ?? "").slice(0, 500),
      }))
      .filter((d) => d.label.trim() || d.url.trim())
      .slice(0, 30);
  }
  return next;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
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
      importSourceUrl: "",
      completeness: 0,
      exists: false,
    });
  }
  const raw = snap.data() as BusinessProfileContent & {
    completeness?: number;
    importSourceUrl?: string;
  };
  const data = withoutExamples({ ...EMPTY_BUSINESS_PROFILE, ...raw });
  if (isDirectoryProfileUrl(data.website)) data.website = "";
  return NextResponse.json({
    profile: data,
    // Import links are transient input, not part of the approved business
    // identity. Old builds persisted them and then refilled the importer on
    // every visit, which looked like a hard-coded Zillow default.
    importSourceUrl: "",
    completeness: businessProfileCompleteness(data),
    exists: true,
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
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
    ? ({
        ...EMPTY_BUSINESS_PROFILE,
        ...snap.data(),
      } as BusinessProfileContent)
    : EMPTY_BUSINESS_PROFILE;

  const next = coerce(current, patch);
  const completeness = businessProfileCompleteness(next);

  const savedAt = FieldValue.serverTimestamp();
  const batch = db.batch();
  if (snap.exists) {
    // Keep an immutable server-side copy before every explicit save. This is
    // the recovery path that the original single-document implementation was
    // missing when an import or operator edit replaced approved information.
    const revision = ref.collection("revisions").doc();
    batch.set(revision, {
      ...snap.data(),
      archivedAt: savedAt,
      archivedByUid: uid,
      reason: "before_explicit_save",
    });
  }
  batch.set(
    ref,
    {
      ...next,
      subAccountId: id,
      agencyId,
      updatedByUid: uid,
      completeness,
      importReviewed: true,
      // Clean up the legacy field that coupled a directory/profile source to
      // the permanent business website workflow.
      importSourceUrl: FieldValue.delete(),
      ...(snap.exists ? {} : { createdAt: savedAt }),
      updatedAt: savedAt,
    },
    { merge: true }
  );
  await batch.commit();

  return NextResponse.json({ ok: true, profile: next, completeness });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const { uid, agencyId } = access;
  if (!agencyId) {
    return NextResponse.json({ error: "Agency not found" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/businessProfile/${DOC}`);
  const snap = await ref.get();
  const resetAt = FieldValue.serverTimestamp();
  const batch = db.batch();

  if (snap.exists) {
    const revision = ref.collection("revisions").doc();
    batch.set(revision, {
      ...snap.data(),
      archivedAt: resetAt,
      archivedByUid: uid,
      reason: "operator_clean_slate_reset",
    });
  }

  // This is intentionally a replacement write. Using merge here would leave
  // unknown legacy fields behind and would not be a genuine clean slate.
  batch.set(ref, {
    ...EMPTY_BUSINESS_PROFILE,
    subAccountId: id,
    agencyId,
    updatedByUid: uid,
    completeness: 0,
    importReviewed: true,
    createdAt: resetAt,
    updatedAt: resetAt,
  });
  await batch.commit();

  return NextResponse.json({
    ok: true,
    profile: EMPTY_BUSINESS_PROFILE,
    importSourceUrl: "",
    completeness: 0,
  });
}

import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  scrapeUrl,
  firecrawlIsConfigured,
  FirecrawlError,
} from "@/lib/firecrawl/client";
import { aiIsConfigured, callAi } from "@/lib/comms/ai/openrouter";
import { businessProfileCompleteness } from "@/lib/business-profile/compile";
import {
  BRAND_VOICES,
  EMPTY_BUSINESS_PROFILE,
  SERVICE_SPECIALTIES,
  type BrandVoice,
  type BusinessProfileContent,
  type ServiceSpecialty,
} from "@/types/business-profile";

const VOICES = new Set(BRAND_VOICES.map((item) => item.id));
const SERVICES = new Set(SERVICE_SPECIALTIES.map((item) => item.id));
const IMPORT_KEYS: (keyof BusinessProfileContent)[] = [
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
  "bio",
  "headshotUrl",
  "logoUrl",
  "testimonials",
];

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function parseObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("AI did not return structured profile data.");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  if (!firecrawlIsConfigured() || !aiIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "AI website import needs FIRECRAWL_API_KEY and OPENROUTER_API_KEY configured.",
      },
      { status: 503 }
    );
  }
  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
    platform?: unknown;
  } | null;
  const url = safeUrl(body?.url);
  if (!url)
    return NextResponse.json(
      { error: "Enter a valid public website or profile URL." },
      { status: 400 }
    );

  let markdown: string;
  try {
    markdown = (await scrapeUrl(url)).markdown.slice(0, 18000);
  } catch (error) {
    const message =
      error instanceof FirecrawlError
        ? error.message
        : "Could not read that website.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const completion = await callAi({
    messages: [
      {
        role: "system",
        content:
          "Extract a factual real-estate business profile from supplied website text. Return one JSON object only. Never guess license numbers, contact details, brokerage, service areas, claims, or testimonials. Use empty strings/arrays when not explicit. services may only contain buyers, sellers, investors, rentals, relocation, luxury, first_time_buyers, commercial. brandVoice may only be professional, luxury, friendly, investor, casual, formal.",
      },
      {
        role: "user",
        content: `Source URL: ${url}\nSource platform: ${String(body?.platform ?? "website")}\n\nReturn JSON with: agentName,title,brokerage,licenseStates,licenseNumber,phone,email,website,languages,clientExperience,idealClientProfile,clientPromise,serviceAreas,priceRanges,specialties,services,brandVoice,businessHours,responsePreference,bio,headshotUrl,logoUrl,testimonials.\n\nWEBSITE TEXT:\n${markdown}`,
      },
    ],
  });

  let extracted: Record<string, unknown>;
  try {
    extracted = parseObject(completion.text);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not parse imported profile.",
      },
      { status: 502 }
    );
  }

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${id}/businessProfile/main`);
  const snap = await ref.get();
  const current = snap.exists
    ? ({ ...EMPTY_BUSINESS_PROFILE, ...snap.data() } as BusinessProfileContent)
    : EMPTY_BUSINESS_PROFILE;
  const next: BusinessProfileContent = { ...current, website: url };
  for (const key of IMPORT_KEYS) {
    const value = extracted[key];
    if (typeof value === "string" && value.trim())
      (next[key] as string) = value.trim().slice(0, 4000);
  }
  if (Array.isArray(extracted.services)) {
    next.services = extracted.services.filter(
      (item): item is ServiceSpecialty =>
        typeof item === "string" && SERVICES.has(item as ServiceSpecialty)
    );
  }
  if (
    typeof extracted.brandVoice === "string" &&
    VOICES.has(extracted.brandVoice as BrandVoice)
  )
    next.brandVoice = extracted.brandVoice as BrandVoice;
  const completeness = businessProfileCompleteness(next);
  await ref.set(
    {
      ...next,
      subAccountId: id,
      agencyId: access.agencyId,
      updatedByUid: access.uid,
      completeness,
      importSourceUrl: url,
      importReviewed: false,
      ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return NextResponse.json({
    ok: true,
    profile: next,
    completeness,
    needsReview: true,
  });
}

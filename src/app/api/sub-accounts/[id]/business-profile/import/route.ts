import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  PageReadError,
  readPublicPage,
  safePublicUrl,
} from "@/lib/business-profile/read-public-page";
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

function parseObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new Error("AI did not return structured profile data.");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

/**
 * Reading a page and extracting from it is slower than the platform's default
 * function ceiling, and a function killed by the gateway writes no body at
 * all — which surfaces in the browser as "Unexpected end of JSON input", a
 * message about our infrastructure shown to an operator who asked about their
 * website. The budgets below are sized to finish inside this.
 *
 *   read (24s, READ_BUDGET_MS) + extract (20s) + Firestore ≈ 50s
 */
export const maxDuration = 60;

/** Leaves headroom under maxDuration for the Firestore read and write. */
const EXTRACT_TIMEOUT_MS = 20_000;

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    return await importProfile(request, ctx);
  } catch (error) {
    // Anything unhandled here would otherwise become a 500 with an empty
    // body. This route is the first screen of the product; it always answers
    // in JSON, and always with something the operator can do next.
    console.error("business-profile import failed", error);
    return NextResponse.json(
      {
        error:
          "Something went wrong on our side while importing. Nothing was changed — try again, or fill your Blueprint in by hand below.",
      },
      { status: 500 }
    );
  }
}

async function importProfile(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  if (!aiIsConfigured()) {
    return NextResponse.json(
      { error: "AI website import is not configured yet." },
      { status: 503 }
    );
  }
  const body = (await request.json().catch(() => null)) as {
    url?: unknown;
    platform?: unknown;
  } | null;
  const url = safePublicUrl(body?.url);
  if (!url)
    return NextResponse.json(
      {
        error:
          "That does not look like a public web address. Paste the full link, starting with https://.",
      },
      { status: 400 }
    );

  let markdown: string;
  try {
    markdown = await readPublicPage(url);
  } catch (error) {
    // readPublicPage names the reason and the next step. Only a genuine bug
    // reaches the fallback, and even that says what to do instead — the old
    // behaviour collapsed every specific message into a dead end.
    return NextResponse.json(
      {
        error:
          error instanceof PageReadError
            ? error.message
            : "Something went wrong reading that page. Try another link, or fill your Blueprint in by hand — every field here is editable.",
      },
      { status: 502 }
    );
  }

  let completion: { text: string };
  try {
    completion = await callAi({
      // A complete Business Blueprint is substantially larger than an SMS
      // reply. JSON mode plus a dedicated output budget prevents the model's
      // object from being truncated before its closing brace.
      maxTokens: 1_800,
      temperature: 0,
      responseFormat: { type: "json_object" },
      timeoutMs: EXTRACT_TIMEOUT_MS,
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
  } catch (error) {
    // OpenRouter is down, rate-limiting us, or slower than the budget. The
    // operator's page was fine, so say that rather than blaming their link.
    console.error("business-profile import: extraction call failed", error);
    return NextResponse.json(
      {
        error:
          "We read your page, but the AI that fills the form is not responding right now. Try again in a minute — or fill your Blueprint in by hand below, which always works.",
      },
      { status: 503 }
    );
  }

  let extracted: Record<string, unknown>;
  try {
    extracted = parseObject(completion.text);
  } catch {
    return NextResponse.json(
      {
        error:
          "We read your page, but could not turn it into profile fields. Try again, or fill your Blueprint in by hand below.",
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

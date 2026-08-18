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
import { recordAiUsage } from "@/lib/comms/ai/usage";
import {
  AI_FAILURE_CODES,
  aiFailureMessage,
  aiFailureStatus,
  classifyAiError,
} from "@/lib/comms/ai/ai-failure";
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

const LINE_IMPORT_KEYS = new Set([
  ...IMPORT_KEYS,
  "services",
  "brandVoice",
] as string[]);

function isMissingMarker(value: string): boolean {
  return /^(?:null|none|unknown|n\/a|\[\]|not (?:provided|available|listed|specified|explicitly stated))$/i.test(
    value.trim()
  );
}

/**
 * Free models do not all honour OpenAI JSON mode consistently. A deliberately
 * boring KEY=VALUE format gives the recovery attempt no brackets, escaping or
 * schema syntax to get wrong, while the allowlist prevents model commentary
 * from becoming profile data.
 */
function parseLineProfile(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim();
    const match = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*[:=]\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (!LINE_IMPORT_KEYS.has(key)) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (!value || isMissingMarker(value)) continue;
    if (key === "services") {
      result.services = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      result[key] = value;
    }
  }
  if (Object.keys(result).length === 0)
    throw new Error("AI did not return line-based profile data.");
  return result;
}

/**
 * Reading a page and extracting from it is slower than the platform's default
 * function ceiling, and a function killed by the gateway writes no body at
 * all — which surfaces in the browser as "Unexpected end of JSON input", a
 * message about our infrastructure shown to an operator who asked about their
 * website. Every budget below is sized to finish inside this.
 *
 *   read (READ_BUDGET_MS) + extract (whatever is left) + Firestore ≈ 52s
 */
export const maxDuration = 60;

/** Wall clock for the whole request, kept under maxDuration. */
const REQUEST_BUDGET_MS = 52_000;

/** Held back for the Firestore read and write after extraction. */
const FIRESTORE_RESERVE_MS = 5_000;

/**
 * Never squeeze the model below this, however long the read took.
 *
 * The extraction call had no timeout at all and worked; adding a flat 20s cap
 * broke it, because a full Blueprint — twenty-odd fields from a page of text —
 * regularly takes longer than that. A fixed number was the wrong shape: what
 * the model can have is whatever the request has not already spent, so that is
 * what it now gets.
 */
const MIN_EXTRACT_MS = 15_000;

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
  const startedAt = Date.now();
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

  async function extractLineProfile() {
    return callAi({
      maxTokens: 650,
      temperature: 0,
      timeoutMs: Math.max(
        REQUEST_BUDGET_MS - (Date.now() - startedAt) - FIRESTORE_RESERVE_MS,
        MIN_EXTRACT_MS
      ),
      messages: [
        {
          role: "system",
          content:
            "Extract only facts explicitly present in the supplied public real-estate profile. Return plain KEY=VALUE lines only. No JSON, markdown, explanation, headings, or guessed facts. Omit unknown values.",
        },
        {
          role: "user",
          content: `Allowed keys: agentName,title,brokerage,licenseStates,licenseNumber,phone,email,website,languages,clientExperience,idealClientProfile,clientPromise,serviceAreas,priceRanges,specialties,services,brandVoice,businessHours,responsePreference,bio,headshotUrl,logoUrl,testimonials. services must be comma-separated and may only use buyers,sellers,investors,rentals,relocation,luxury,first_time_buyers,commercial. brandVoice may only be professional,luxury,friendly,investor,casual,formal.\n\nSource URL: ${url}\nSource platform: ${String(body?.platform ?? "website")}\n\nWEBSITE TEXT:\n${markdown}`,
        },
      ],
    });
  }

  let completion: Awaited<ReturnType<typeof callAi>>;
  try {
    // Use the low-overhead line protocol first. The former JSON-first flow
    // could consume the entire serverless request budget before recovery even
    // started. One compact call gives the provider the full available window
    // and avoids relying on inconsistent JSON-mode support from free models.
    completion = await extractLineProfile();
  } catch (error) {
    // The operator's page was fine, so do not blame their link — and name the
    // actual fault, because "not responding" covered a timeout, a bad key, an
    // empty balance and an outage equally well, and only one of those is
    // worth retrying.
    const failure = classifyAiError(error);
    console.error(
      `business-profile import: extraction failed (${failure})`,
      error
    );
    return NextResponse.json(
      { error: aiFailureMessage(failure), code: AI_FAILURE_CODES[failure] },
      { status: aiFailureStatus(failure) }
    );
  }

  void recordAiUsage({
    subAccountId: id,
    feature: "blueprint_import",
    completion,
  });

  let extracted: Record<string, unknown>;
  try {
    extracted = parseLineProfile(completion.text);
  } catch (error) {
    console.error("business-profile import: invalid structured output", error);
    return NextResponse.json(
      {
        error:
          "We read your page, but could not turn it into profile fields. Try another public website or fill your Blueprint in by hand below.",
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
  // Older/free-model imports may have persisted prose placeholders instead of
  // omissions. Treat those as empty on the next import so a retry repairs the
  // draft rather than preserving misleading profile data.
  for (const key of IMPORT_KEYS) {
    const value = current[key];
    if (typeof value === "string" && isMissingMarker(value))
      (current[key] as string) = "";
  }
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

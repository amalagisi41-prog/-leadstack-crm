import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  PageReadError,
  readPublicPageContent,
  safePublicUrl,
  type PageContent,
} from "@/lib/business-profile/read-public-page";
import {
  extractStructuredProfile,
  normalizeEmail,
  normalizePhone,
} from "@/lib/business-profile/structured-profile";
import { callAi } from "@/lib/comms/ai/openrouter";
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
// Blueprint imports need a deterministic model, but must also honor the
// workspace's OpenRouter privacy policy. The former hard-coded `:free` model
// was rejected when free endpoints required data retention the account had
// disabled. Use an explicit import override when configured; otherwise use
// a vetted privacy-compatible model. Do not inherit the global model here:
// a legacy `openrouter/free` setting can select the same incompatible class
// of endpoint and silently reintroduce this failure.
const IMPORT_MODEL =
  process.env.BLUEPRINT_IMPORT_MODEL?.trim() || "anthropic/claude-haiku-4.5";
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
 * Last-resort, non-AI extraction. Portal pages are often readable while the
 * model provider is unavailable. Returning a conservative draft keeps the
 * onboarding workflow usable and never invents regulated/contact facts.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function directoryProfileHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Zillow's reader output is stable, labelled profile text. Extract those
 * labels directly so a model outage cannot turn a complete public profile
 * into a misleading name-only "AI import". Every value below must occur in
 * the source text; no marketing promise, licence, or contact fact is guessed.
 */
function zillowProfileFromPage(
  url: string,
  text: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Reader markdown preserves link destinations (including percent-encoded
  // spaces in tel: links). Decode only the harmless encodings Zillow emits
  // before matching; malformed percent sequences must never abort an import.
  const decodedText = text.replace(/%20/gi, " ").replace(/%2B/gi, "+");
  const normalized = decodedText.replace(/\s+/g, " ").trim();
  const pathName = (() => {
    try {
      return decodeURIComponent(new URL(url).pathname).replace(/\/+$/, "");
    } catch {
      return "";
    }
  })();
  const slug = pathName.split("/").filter(Boolean).pop() ?? "";
  const agentName = slug.replace(/[-_]+/g, " ").trim();
  if (/^[A-Za-z][A-Za-z .'-]{3,80}$/.test(agentName)) {
    result.agentName = agentName;
  }

  const namePattern = agentName ? escapeRegExp(agentName) : "[A-Z][A-Za-z .'-]+";
  // Zillow repeats the agent name in its document title, navigation and
  // profile summary. A loose "name ... rating" match swallowed everything
  // between the title and rating (for example "Report a problem ...") into
  // Brokerage. Require Zillow's adjacent rating + review label, consider all
  // repeated summaries, and take the shortest clean candidate.
  const brokerage = Array.from(
    normalized.matchAll(/5(?:\.0)?\s+(?:\[?\d+\s+reviews?|\d+\s+Reviews?)/gi),
    (rating) => {
      // Work backwards from each rating and use the *last* occurrence of the
      // agent's name. Zillow repeats "Report a problem" and the profile title
      // ahead of the real summary; a forward match absorbs that UI copy.
      const before = normalized.slice(Math.max(0, rating.index! - 300), rating.index);
      const names = Array.from(before.matchAll(new RegExp(namePattern, "gi")));
      const lastName = names.at(-1);
      return lastName
        ? before.slice(lastName.index! + lastName[0].length).trim()
        : "";
    },
  )
    .filter(
      (candidate) =>
        candidate.length <= 80 &&
        !/(?:report a problem|recent sales|profile summary|real estate agent in)/i.test(
          candidate,
        ),
    )
    .sort((a, b) => a.length - b.length)[0];
  if (brokerage) result.brokerage = brokerage.trim();

  if (/Real Estate Agent/i.test(normalized)) result.title = "Real Estate Agent";

  const phone =
    decodedText.match(
      /\[((?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]*\d{3}[ .-]*\d{4})\]\(tel:/i,
    )?.[1] ??
    normalized.match(
      /(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]+\d{3}[ .-]+\d{4}/,
    )?.[0];
  if (phone) result.phone = phone.trim();
  const email = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) result.email = email.trim();

  const agentWebsite = decodedText.match(
    /Visit agent website[^\n\r)]*\(((?:https?:\/\/)?[A-Z0-9.-]+\.[A-Z]{2,}(?:\/[^)\s]*)?)\)/i,
  )?.[1] ?? normalized.match(/Visit agent website\s+((?:https?:\/\/)?[A-Z0-9.-]+\.[A-Z]{2,}(?:\/[^\s]*)?)/i)?.[1];
  if (agentWebsite) {
    const cleanWebsite = agentWebsite.replace(/[.,;]+$/, "");
    result.website = /^https?:\/\//i.test(cleanWebsite)
      ? cleanWebsite
      : `https://${cleanWebsite}`;
  }

  const priceRange = normalized.match(/\$\d+(?:\.\d+)?[KMB]\s*[-–]\s*\$\d+(?:\.\d+)?[KMB]/i)?.[0];
  if (priceRange) result.priceRanges = priceRange.replace(/\s+/g, "");

  // Property cards contain hundreds of city/state pairs. Only inspect the
  // final labelled Service areas section and stop before Zillow's nearby-city
  // navigation so sold listings cannot become an agent's service territory.
  const serviceStart = normalized.toLowerCase().lastIndexOf("service areas");
  const serviceTail = serviceStart >= 0 ? normalized.slice(serviceStart) : "";
  const serviceBlock = serviceTail.match(
    /Service areas\s*\(\d+\)\s*(.*?)(?:Nearby cities|Contact\s+[A-Z]|Nearby neighborhoods|$)/i,
  )?.[1] ?? "";
  const serviceAreas = Array.from(
    serviceBlock.matchAll(/\b([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})\b/g),
    (match) => match[1].trim(),
  ).filter((value, index, all) => all.indexOf(value) === index);
  if (serviceAreas.length) result.serviceAreas = serviceAreas.join(", ");

  const specialties = [
    ["Buyer's Agent", /Buyer'?s Agent/i, "buyers"],
    ["Listing Agent", /Listing Agent/i, "sellers"],
    ["Commercial Properties", /Commercial Properties/i, "commercial"],
    ["Investment Properties", /Investment Properties/i, "investors"],
    ["New Construction", /New Construction/i, null],
    ["Relocation", /\bRelocation\b/i, "relocation"],
    ["Luxury", /\bLuxury\b/i, "luxury"],
    ["Rentals", /\bRentals?\b/i, "rentals"],
  ] as const;
  const foundSpecialties = specialties.filter(([, pattern]) => pattern.test(normalized));
  if (foundSpecialties.length) {
    result.specialties = foundSpecialties.map(([label]) => label).join(", ");
    result.services = foundSpecialties
      .map(([, , service]) => service)
      .filter((service) => service !== null) as ServiceSpecialty[];
  }

  const bio = normalized.match(
    new RegExp(`Get to know ${namePattern}\\s+(?:Real Estate Industry\\s+)?(.*?)(?:Specialties|\\d+\\s+Years?\\s+of experience)`, "i"),
  )?.[1];
  if (bio && bio.length >= 40) result.bio = bio.trim().slice(0, 4000);

  const years = normalized.match(/(\d+)\s+Years?\s+of experience/i)?.[1];
  if (years) {
    result.clientExperience = `${years} years of real estate experience`;
  }
  return result;
}

function conservativeProfileFromPage(url: string, text: string): Record<string, unknown> {
  if (directoryProfileHost(url).endsWith("zillow.com")) {
    const zillow = zillowProfileFromPage(url, text);
    if (Object.keys(zillow).length > 0) return zillow;
  }
  const result: Record<string, unknown> = {};
  const normalized = text.replace(/\s+/g, " ").trim();
  const slug = (() => {
    try {
      const parts = decodeURIComponent(new URL(url).pathname)
        .split("/")
        .filter(Boolean);
      const candidate = parts.at(-1) ?? "";
      return /^[a-z]+(?:[-_][a-z]+)+$/i.test(candidate)
        ? candidate.replace(/[-_]+/g, " ")
        : "";
    } catch {
      return "";
    }
  })();
  if (slug) result.agentName = slug.replace(/\b\w/g, (letter) => letter.toUpperCase());

  const title = normalized.match(
    /\b(Real Estate Agent|Realtor(?:®)?|Broker Associate|Commercial Broker|Real Estate Broker)\b/i,
  )?.[1];
  if (title) result.title = title;
  const brokerage = normalized.match(/(?:brokerage|office|affiliated with)\s*[:\-]?\s*([A-Z][A-Za-z0-9&' .-]{2,80})/i)?.[1];
  if (brokerage) result.brokerage = brokerage.trim();
  const phone = normalized.match(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}/)?.[0];
  if (phone) result.phone = phone;
  const email = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (email) result.email = email;
  const priceRange = normalized.match(/\$\d+(?:\.\d+)?[KMB]?\s*[-–]\s*\$\d+(?:\.\d+)?[KMB]?/i)?.[0];
  if (priceRange) result.priceRanges = priceRange.replace(/\s+/g, "");
  const licenseNumber = normalized.match(
    /\b(?:license|licence|lic)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z]{0,3}[- ]?\d{4,12})\b/i,
  )?.[1];
  if (licenseNumber) result.licenseNumber = licenseNumber.trim();
  const licenseStates = normalized.match(
    /\b(?:licensed|licenced)\s+in\s+(?:the\s+)?((?:[A-Z]{2})(?:\s*,\s*[A-Z]{2})*)\b/i,
  )?.[1];
  if (licenseStates) result.licenseStates = licenseStates.replace(/\s+/g, " ").trim();
  const specialties = [
    ["Buyer's Agent", /Buyer'?s Agent/i, "buyers"],
    ["Listing Agent", /Listing Agent/i, "sellers"],
    ["Commercial Properties", /Commercial Properties|Commercial Broker/i, "commercial"],
    ["Investment Properties", /Investment Properties|Real Estate Investor/i, "investors"],
    ["New Construction", /New Construction/i, null],
    ["Relocation", /\bRelocation\b/i, "relocation"],
    ["Luxury", /\bLuxury\b/i, "luxury"],
    ["Rentals", /\bRentals?\b/i, "rentals"],
  ] as const;
  const foundSpecialties = specialties.filter(([, pattern]) => pattern.test(normalized));
  if (foundSpecialties.length) {
    result.specialties = foundSpecialties.map(([label]) => label).join(", ");
    result.services = foundSpecialties
      .map(([, , service]) => service)
      .filter((service) => service !== null) as ServiceSpecialty[];
  }
  return result;
}

function sanitizeImportedProfile(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of IMPORT_KEYS) {
    const value = values[key];
    if (typeof value !== "string") continue;
    const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!text || isMissingMarker(text) || /^(?:source url|website text|allowed keys)\s*:/i.test(text)) continue;
    if (key === "phone") {
      const phone = normalizePhone(text);
      if (phone) clean[key] = phone;
      continue;
    }
    if (key === "email") {
      const email = normalizeEmail(text);
      if (email) clean[key] = email;
      continue;
    }
    if (key === "website") {
      const website = safePublicUrl(text);
      if (website && !isDirectoryProfileUrl(website)) clean[key] = website;
      continue;
    }
    clean[key] = text.slice(0, 4000);
  }
  if (Array.isArray(values.services)) {
    clean.services = values.services.filter(
      (item): item is ServiceSpecialty =>
        typeof item === "string" && SERVICES.has(item as ServiceSpecialty),
    );
  }
  if (typeof values.brandVoice === "string" && VOICES.has(values.brandVoice as BrandVoice)) {
    clean.brandVoice = values.brandVoice as BrandVoice;
  }
  return clean;
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
  // Do not reject the request before reading the public page. Production
  // deployments can briefly lose the provider key (or be rate limited), but
  // the page reader and deterministic extractor can still produce a safe,
  // review-only draft. The old early 503 made every link look broken and
  // prevented the operator from seeing what was actually readable.
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

  let page: PageContent;
  try {
    page = await readPublicPageContent(url);
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

  const markdown = page.text;

  // Supported directory pages should not depend on an LLM merely to copy
  // stable, labelled facts. If the source reader already has every launch
  // essential, use it directly. This is both more accurate and resilient to
  // provider keys, credits, model routing, timeouts, and malformed output.
  //
  // Every other source gets the generic structured extractor: schema.org
  // JSON-LD and tel:/mailto: links are the page's own machine-readable
  // declaration of who the agent is, and they were previously stripped out
  // before the model ever saw the page. Facts from structure are
  // deterministic, so they merge ahead of model output further down.
  const isZillowSource = directoryProfileHost(url).endsWith("zillow.com");
  const textFacts = conservativeProfileFromPage(url, markdown);
  const declaredFacts = isZillowSource
    ? zillowProfileFromPage(url, markdown)
    : extractStructuredProfile({ raw: page.raw, kind: page.kind, url });
  const sourceFacts = sanitizeImportedProfile({ ...textFacts, ...declaredFacts });
  const sourceCompleteness =
    Object.keys(sourceFacts).length > 0
      ? businessProfileCompleteness({
          ...EMPTY_BUSINESS_PROFILE,
          ...sourceFacts,
        } as BusinessProfileContent)
      : 0;

  const sourceIsComplete = sourceCompleteness === 100;
  // A partial Zillow read is still useful, but it must remain deterministic.
  // Return only facts copied from the public source and let the operator fill
  // the gaps. Falling through to the model here would trade a visible missing
  // field for a plausible-sounding hallucination.
  const sourceIsVerifiedDraft =
    Object.keys(declaredFacts).length > 0 ||
    ["agentName", "brokerage", "phone", "email"].some((key) =>
      typeof sourceFacts[key] === "string" && Boolean(sourceFacts[key]),
    );

  async function extractLineProfile() {
    return callAi({
      model: IMPORT_MODEL,
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

  async function extractJsonProfile(timeoutMs: number) {
    return callAi({
      model: IMPORT_MODEL,
      maxTokens: 800,
      temperature: 0,
      responseFormat: { type: "json_object" },
      timeoutMs,
      messages: [
        {
          role: "system",
          content:
            "Extract only facts explicitly present in the supplied public real-estate profile. Return one compact JSON object only, with no markdown, explanation, or guessed facts. Omit unknown values.",
        },
        {
          role: "user",
          content: `Allowed keys: agentName,title,brokerage,licenseStates,licenseNumber,phone,email,website,languages,clientExperience,idealClientProfile,clientPromise,serviceAreas,priceRanges,specialties,services,brandVoice,businessHours,responsePreference,bio,headshotUrl,logoUrl,testimonials. services may only use buyers,sellers,investors,rentals,relocation,luxury,first_time_buyers,commercial. brandVoice may only use professional,luxury,friendly,investor,casual,formal.\n\nSource URL: ${url}\nSource platform: ${String(body?.platform ?? "website")}\n\nWEBSITE TEXT:\n${markdown}`,
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
    // Schema and explicit source text are already verified facts. Return them
    // immediately; AI is enrichment only and must never gate basic setup or
    // replace clean contact/identity values with prose.
    completion = sourceIsComplete || sourceIsVerifiedDraft
      ? {
          text: Object.entries(sourceFacts)
            .map(([key, value]) => `${key}=${value}`)
            .join("\n"),
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          model: "local-reader",
        }
      : await extractLineProfile();
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
    // Keep the operator moving when the provider/key is temporarily
    // unavailable. This draft contains only facts we can read directly; it
    // is still review-only and never writes until Save profile is pressed.
    const fallback = {
      ...conservativeProfileFromPage(url, markdown),
      ...sourceFacts,
    };
    const hasUsefulFallback = [
      "agentName",
      "brokerage",
      "phone",
      "email",
      "serviceAreas",
      "priceRanges",
      "specialties",
      "bio",
    ].some((key) => typeof fallback[key] === "string" && Boolean(fallback[key]));
    if (hasUsefulFallback) {
      completion = { text: Object.entries(fallback).map(([k, v]) => `${k}=${v}`).join("\n"), promptTokens: 0, completionTokens: 0, totalTokens: 0, model: "local-reader" };
    } else {
      return NextResponse.json(
        { error: aiFailureMessage(failure), code: AI_FAILURE_CODES[failure] },
        { status: aiFailureStatus(failure) }
      );
    }
  }

  void recordAiUsage({
    subAccountId: id,
    feature: "blueprint_import",
    completion,
  });

  let extracted: Record<string, unknown>;
  try {
    extracted = sanitizeImportedProfile(parseLineProfile(completion.text));
  } catch (error) {
    const remainingMs =
      REQUEST_BUDGET_MS - (Date.now() - startedAt) - FIRESTORE_RESERVE_MS;
    try {
      if (remainingMs < 8_000) throw error;
      completion = await extractJsonProfile(remainingMs);
      void recordAiUsage({
        subAccountId: id,
        feature: "blueprint_import",
        completion,
      });
      extracted = sanitizeImportedProfile(parseObject(completion.text));
    } catch (retryError) {
      console.error(
        "business-profile import: invalid structured output",
        retryError
      );
      const hasUsefulSourceFacts = [
        "agentName",
        "brokerage",
        "phone",
        "email",
        "serviceAreas",
        "priceRanges",
        "specialties",
        "bio",
      ].some((key) => typeof sourceFacts[key] === "string" && Boolean(sourceFacts[key]));
      if (hasUsefulSourceFacts) {
        extracted = sourceFacts;
      } else {
        return NextResponse.json(
          {
            error:
              "We read your page, but could not turn it into profile fields. Try another public website or fill your Blueprint in by hand below.",
          },
          { status: 502 }
        );
      }
    }
  }

  // Directory pages expose several important facts behind stable, labelled
  // sections. Merge those source facts even when the AI call technically
  // succeeds: a provider returning only the agent name must not downgrade a
  // complete Zillow page to a misleading 14% draft. The labelled source wins
  // on these fields because every value is traceable to the public page.
  if (Object.keys(sourceFacts).length > 0) {
    extracted = sanitizeImportedProfile({ ...extracted, ...sourceFacts });
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
  if (current.website === url || isDirectoryProfileUrl(current.website))
    current.website = "";
  const next: BusinessProfileContent = { ...current };
  for (const key of IMPORT_KEYS) {
    if (key === "website") continue;
    const value = extracted[key];
    if (typeof value === "string" && value.trim())
      (next[key] as string) = value.trim().slice(0, 4000);
  }
  if (typeof extracted.website === "string") {
    const extractedWebsite = safePublicUrl(extracted.website);
    if (
      extractedWebsite &&
      extractedWebsite !== url &&
      !isDirectoryProfileUrl(extractedWebsite)
    )
      next.website = extractedWebsite;
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
  const missingLaunchFields = [
    !next.agentName.trim() ? "agentName" : null,
    !next.brokerage.trim() ? "brokerage" : null,
    !next.phone.trim() && !next.email.trim()
      ? "phoneOrEmail"
      : null,
    !next.serviceAreas.trim() ? "serviceAreas" : null,
    next.services.length === 0 ? "services" : null,
    !next.bio.trim() && !next.priceRanges.trim()
      ? "bioOrPriceRange"
      : null,
    !next.website.trim() ? "website" : null,
  ].filter((field): field is string => field !== null);
  // Deliberately do not write this draft to Firestore. The operator must see
  // and approve it with "Save profile" first. Previously this endpoint wrote
  // directly to businessProfile/main, so even an exploratory import could
  // replace an already-approved 100% profile and its real website.
  return NextResponse.json({
    ok: true,
    profile: next,
    completeness,
    needsReview: true,
    sourceCompleteness,
    missingLaunchFields,
    importSourceUrl: url,
    extractionMode:
      completion.model === "local-reader" || Object.keys(sourceFacts).length > 0
        ? "source-reader"
        : "ai",
  });
}

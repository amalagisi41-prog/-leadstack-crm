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
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || isPrivateHost(url.hostname))
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("127.") ||
    host.startsWith("169.254.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  );
}

function readableText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function readPublicPage(startUrl: string): Promise<string> {
  if (firecrawlIsConfigured()) {
    return (await scrapeUrl(startUrl)).markdown.slice(0, 18000);
  }

  let current = startUrl;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AgentStackProfileImport/1.0; +https://agentstackcrm.app)",
        Accept: "text/html,text/plain;q=0.9",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      const next = location
        ? safeUrl(new URL(location, current).toString())
        : null;
      if (!next)
        throw new Error("That website redirected to an unsafe address.");
      current = next;
      continue;
    }
    if (!response.ok)
      throw new Error(`That website returned ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      throw new Error("That link is not a readable public web page.");
    }
    const body = (await response.text()).slice(0, 250_000);
    const text = readableText(body).slice(0, 18000);
    if (!text)
      throw new Error("No readable business details were found on that page.");
    return text;
  }
  throw new Error("That website redirected too many times.");
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
  const url = safeUrl(body?.url);
  if (!url)
    return NextResponse.json(
      { error: "Enter a valid public website or profile URL." },
      { status: 400 }
    );

  let markdown: string;
  try {
    markdown = await readPublicPage(url);
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

import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  aiIsConfigured,
  callAi,
  type AiChatMessage,
} from "@/lib/comms/ai/openrouter";
import { compileBusinessProfilePrompt } from "@/lib/business-profile/compile";
import {
  websiteStudioGateOpen,
  WEBSITE_STUDIO_LOCKED_MESSAGE,
} from "@/lib/website-studio/gate";
import {
  DESIGNER_STEPS,
  buildDesignerSystemPrompt,
  isLastStep,
} from "@/lib/website-studio/designer";
import { normalizeAgentSiteComposition } from "@/lib/website-studio/site-composition";
import type { AgentSiteContent, DesignerTurn } from "@/types/agent-site";
import {
  EMPTY_BUSINESS_PROFILE,
  type BusinessProfileContent,
} from "@/types/business-profile";

/**
 * POST /api/sub-accounts/[id]/agent-site/designer
 *
 * One turn of the AI Designer interview. Applies the model's field updates to
 * the site content, advances the guided step, appends to the transcript, and
 * returns the designer's next message. 503 when OpenRouter is unset.
 */

const SITE_ID = "main";
const CONTENT_KEYS = new Set<keyof AgentSiteContent>([
  "agentName",
  "title",
  "brokerage",
  "tagline",
  "bio",
  "phone",
  "email",
  "serviceAreas",
  "specialties",
  "logoUrl",
  "headshotUrl",
  "heroImageUrl",
  "instagram",
  "facebook",
  "linkedin",
  "ctaHeadline",
  "ctaSubtext",
]);

function parseModelJson(text: string): {
  fields?: Record<string, unknown>;
  reply?: string;
  advance?: boolean;
} | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back to extracting the first {...} block.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Merge only known content keys; coerce specialties to a string array. */
function applyFields(
  current: AgentSiteContent,
  fields: Record<string, unknown>
): AgentSiteContent {
  const next = { ...current };
  for (const [k, v] of Object.entries(fields)) {
    const key = k as keyof AgentSiteContent;
    if (!CONTENT_KEYS.has(key)) continue;
    if (key === "specialties") {
      if (Array.isArray(v)) {
        (next.specialties as string[]) = v
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 8);
      }
    } else if (typeof v === "string") {
      (next[key] as string) = v.trim().slice(0, 1200);
    }
  }
  return next;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!(await websiteStudioGateOpen(subAccountId))) {
    return NextResponse.json(
      { error: WEBSITE_STUDIO_LOCKED_MESSAGE },
      { status: 403 }
    );
  }

  if (!aiIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "The Designer isn't available on this deployment yet (OpenRouter isn't configured).",
      },
      { status: 503 }
    );
  }

  let body: { message?: unknown; brandName?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 1500) : "";
  if (!message) {
    return NextResponse.json(
      { error: "A message is required." },
      { status: 400 }
    );
  }
  const brandName =
    typeof body.brandName === "string" && body.brandName.trim()
      ? body.brandName.trim().slice(0, 80)
      : "your CRM";
  const vibeMode = body.mode === "vibe";

  const db = getAdminDb();
  const ref = db.doc(`subAccounts/${subAccountId}/agentSites/${SITE_ID}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json(
      { error: "Pick a template first." },
      { status: 400 }
    );
  }
  const site = snap.data() as {
    templateId: string;
    slug: string;
    status: string;
    composition?: unknown;
    content: AgentSiteContent;
    designerStep: number;
    designerTranscript?: DesignerTurn[];
  };
  const step = Math.min(site.designerStep ?? 0, DESIGNER_STEPS.length - 1);

  const profileSnap = vibeMode
    ? await db.doc(`subAccounts/${subAccountId}/businessProfile/main`).get()
    : null;
  const profile = profileSnap?.exists
    ? ({
        ...EMPTY_BUSINESS_PROFILE,
        ...(profileSnap.data() as Partial<BusinessProfileContent>),
      } as BusinessProfileContent)
    : EMPTY_BUSINESS_PROFILE;
  const blueprint = vibeMode ? compileBusinessProfilePrompt(profile) : null;
  const systemPrompt = vibeMode
    ? `You are Zack inside ${brandName}'s Vibe Builder. Help a real-estate professional customize a private website through short natural-language prompts. Apply every concrete request you can to the allowed website content fields. Never invent licenses, awards, sales numbers, testimonials, or market claims. Treat the approved Business Blueprint and current website content below as already known. Never ask the user to repeat a name, title, brokerage, contact detail, service area, specialty, biography, or media URL that is already present there. If the user asks you to load or review the Blueprint, populate every supported blank field from it and briefly summarize what is ready. If the request is unclear, ask one concise follow-up question. The visual style/template is controlled separately in the interface, so explain that briefly if asked to change layout beyond the available content fields.

CURRENT WEBSITE CONTENT:
${JSON.stringify(site.content)}

${blueprint ? `APPROVED BUSINESS BLUEPRINT:\n${blueprint}` : "No approved Business Blueprint details are available yet."}

Return STRICT JSON only:
{
  "fields": { <any allowed website content fields that should change> },
  "reply": "<brief confirmation or one follow-up question>",
  "advance": false
}`
    : buildDesignerSystemPrompt(step, site.content, brandName);

  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  let parsed: ReturnType<typeof parseModelJson> = null;
  try {
    const result = await callAi({ messages, maxTokens: 700, temperature: 0.5 });
    parsed = parseModelJson(result.text);
  } catch (err) {
    console.error("[agent-site/designer] LLM failed", err);
    return NextResponse.json(
      { error: "The Designer had trouble responding. Try again." },
      { status: 502 }
    );
  }

  if (!parsed) {
    return NextResponse.json(
      {
        error: "The Designer returned an unexpected response. Try rephrasing.",
      },
      { status: 502 }
    );
  }

  const nextContent = applyFields(site.content, parsed.fields ?? {});
  const advance = vibeMode ? false : parsed.advance !== false;
  const done = advance && isLastStep(step);
  const nextStep = advance && !isLastStep(step) ? step + 1 : step;
  const reply = (parsed.reply ?? "Got it — what's next?").trim();

  const transcript: DesignerTurn[] = [
    ...(site.designerTranscript ?? []),
    { role: "agent" as const, content: message },
    { role: "designer" as const, content: reply },
  ].slice(-40);

  const revisionRef = ref.collection("revisions").doc();
  const batch = db.batch();
  batch.set(revisionRef, {
    id: revisionRef.id,
    siteId: SITE_ID,
    subAccountId,
    createdByUid: access.uid,
    source: "zack",
    label: "Before Zack update",
    templateId: site.templateId,
    slug: site.slug,
    status: site.status,
    content: site.content,
    composition: normalizeAgentSiteComposition(site.composition),
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(ref, {
    content: nextContent,
    designerStep: nextStep,
    designerTranscript: transcript,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return NextResponse.json({
    reply,
    content: nextContent,
    step: nextStep,
    totalSteps: DESIGNER_STEPS.length,
    done: vibeMode ? false : done,
  });
}

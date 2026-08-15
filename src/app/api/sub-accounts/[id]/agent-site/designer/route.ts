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

  let body: {
    message?: unknown;
    brandName?: unknown;
    mode?: unknown;
    image?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 1500) : "";
  // Optional reference screenshot as a compact data URL. The client
  // downscales/compresses before upload; re-validate shape and size here so
  // the route never forwards arbitrary payloads to the model.
  const image =
    typeof body.image === "string" &&
    /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image) &&
    body.image.length <= 4_000_000
      ? body.image
      : null;
  if (!message && !image) {
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
    ? `You are Zack inside ${brandName}'s Vibe Builder. Help a real-estate professional customize a private website through short natural-language prompts. Apply every concrete request you can to the allowed website content fields. Never invent licenses, awards, sales numbers, testimonials, or market claims. Treat the approved Business Blueprint and current website content below as already known. Never ask the user to repeat a name, title, brokerage, contact detail, service area, specialty, biography, or media URL that is already present there. If the user asks you to load or review the Blueprint, populate every supported blank field from it and briefly summarize what is ready.

CONVERSATION STYLE — this matters:
- You are shown the recent conversation history below the current message. Use it. Never ask the user to re-explain or re-attach something already covered in that history — if they say "the screenshot" or "that reference," look back at what you already extracted from it.
- Only mention that layout/colors/fonts/navigation are template-controlled ONCE per conversation, and only when it's actually relevant to what the user just asked. Do not repeat this caveat on unrelated turns.
- Do not end every reply with a generic prompt like "What would you like to customize first?" Only ask a follow-up question when you genuinely need more information to proceed. Otherwise, confirm what changed and stop — a specific, next-step suggestion tied to what's still blank is fine, a repeated boilerplate question is not.
- If the request is unclear, ask one concise, specific follow-up question — never a generic restart.

SCREENSHOT MATCHING: When the user attaches a screenshot of a website they want to match, study it carefully. Extract the headline and tagline wording style, the call-to-action language, the tone of the copy, and any visible business details that also appear in the Blueprint. Rewrite the allowed content fields (tagline, bio, ctaHeadline, ctaSubtext, and others) so the draft reads like the reference — same energy, same structure — while keeping every fact truthful to the Blueprint. Note in your reply which visual aspects (layout, colors, fonts, navigation structure) are set by the template rather than these fields — but say this once, not on every turn.

CURRENT WEBSITE CONTENT:
${JSON.stringify(site.content)}

${blueprint ? `APPROVED BUSINESS BLUEPRINT:\n${blueprint}` : "No approved Business Blueprint details are available yet."}

Return STRICT JSON only, every time, with no prose outside it:
{
  "fields": { <any allowed website content fields that should change> },
  "reply": "<your message to the user>",
  "advance": false
}`
    : buildDesignerSystemPrompt(step, site.content, brandName);

  const userText =
    message ||
    "Use this screenshot as the design reference and update the site content to match it.";

  // Recent history gives Zack continuity across turns — without it every
  // message is answered in isolation, so references to "the screenshot" or
  // "that change" from a prior turn go unrecognized. Images are never
  // replayed (they're never stored), only the text of what was said and
  // what Zack extracted/decided.
  const history: AiChatMessage[] = vibeMode
    ? (site.designerTranscript ?? []).slice(-8).map((turn) => ({
        role: turn.role === "agent" ? "user" : "assistant",
        content: turn.content,
      }))
    : [];

  const currentTurn: AiChatMessage = {
    role: "user",
    content: image
      ? [
          { type: "image_url", image_url: { url: image } },
          { type: "text", text: userText },
        ]
      : userText,
  };

  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    currentTurn,
  ];

  let parsed: ReturnType<typeof parseModelJson> = null;
  let rawText = "";
  try {
    const result = await callAi({
      messages,
      maxTokens: image ? 900 : 700,
      temperature: 0.5,
    });
    rawText = result.text;
    parsed = parseModelJson(rawText);
    // The model occasionally wraps JSON in prose despite instructions. One
    // retry with the failure shown back to it recovers almost every case
    // instead of surfacing a dead-end error to the user.
    if (!parsed) {
      const retry = await callAi({
        messages: [
          ...messages,
          { role: "assistant", content: rawText },
          {
            role: "user",
            content:
              "That response wasn't valid JSON. Reply again with ONLY the JSON object — no prose, no markdown fences.",
          },
        ],
        maxTokens: image ? 900 : 700,
        temperature: 0.2,
      });
      parsed = parseModelJson(retry.text);
    }
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

  // Persist a marker instead of the image itself — Firestore documents cap
  // at 1MB and the transcript must stay small.
  const storedAgentTurn = image ? `${userText} 📎 [screenshot attached]` : message;
  const transcript: DesignerTurn[] = [
    ...(site.designerTranscript ?? []),
    { role: "agent" as const, content: storedAgentTurn },
    { role: "designer" as const, content: reply },
  ].slice(-40);

  await ref.update({
    content: nextContent,
    designerStep: nextStep,
    designerTranscript: transcript,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({
    reply,
    content: nextContent,
    step: nextStep,
    totalSteps: DESIGNER_STEPS.length,
    done: vibeMode ? false : done,
  });
}

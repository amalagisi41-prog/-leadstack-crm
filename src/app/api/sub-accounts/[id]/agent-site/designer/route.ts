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
import { applyDesignFields } from "@/lib/website-studio/design";
import {
  describeExternalCode,
  extractExternalCode,
  mergeCustomCss,
  summarizeExternalCode,
  transcriptTextFor,
} from "@/lib/website-studio/external-prompt";
import {
  describeBlockedFields,
  screenContentFields,
} from "@/lib/website-studio/content-compliance";
import type {
  AgentSiteContent,
  AgentSiteDesign,
  DesignerTurn,
} from "@/types/agent-site";
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
/**
 * Headroom for a pasted stylesheet or design spec. Sized above the 20,000
 * character custom-CSS ceiling so an oversized paste is reported to the user
 * rather than silently clipped into invalid CSS by the request cap.
 */
const MAX_VIBE_MESSAGE_CHARS = 24_000;
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
  "metaTitle",
  "metaDescription",
  "ogImageUrl",
]);

function parseModelJson(text: string): {
  fields?: Record<string, unknown>;
  design?: Record<string, unknown>;
  reply?: string;
  advance?: boolean;
  suggestions?: unknown;
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

/** Up to 4 clickable next-step suggestions; short strings only. */
function parseSuggestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((s) => s.slice(0, 140));
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
  const vibeMode = body.mode === "vibe";
  // Vibe Builder accepts pasted stylesheets and design specs from Claude or
  // ChatGPT, which routinely run to several thousand characters; the guided
  // interview only ever collects short answers, so it keeps the tight cap.
  const messageLimit = vibeMode ? MAX_VIBE_MESSAGE_CHARS : 1500;
  const rawMessage =
    typeof body.message === "string" ? body.message.trim() : "";
  // Rejected rather than sliced: quietly cutting a stylesheet in half
  // produces CSS that is syntactically broken but looks like it applied.
  if (vibeMode && rawMessage.length > messageLimit) {
    return NextResponse.json(
      {
        error: `That message is ${rawMessage.length.toLocaleString()} characters — the limit is ${messageLimit.toLocaleString()}. Send the sections you want changed rather than the whole file.`,
      },
      { status: 400 }
    );
  }
  const message = rawMessage.slice(0, messageLimit);
  const image =
    typeof body.image === "string" &&
    /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(
      body.image
    ) &&
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

  // Code and design tokens are lifted out of the message before the model
  // sees it, so a pasted stylesheet is applied byte-for-byte instead of
  // being echoed back through a token-capped JSON response.
  const external = vibeMode
    ? extractExternalCode(message)
    : extractExternalCode("");

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
    design?: AgentSiteDesign;
    designerStep: number;
    designerTranscript?: DesignerTurn[];
  };
  const currentDesign = site.design ?? {};
  const step = Math.min(site.designerStep ?? 0, DESIGNER_STEPS.length - 1);

  // Pasted code lands first, through the same validator that guards Zack's
  // own output — nothing skips sanitizing or scoping. The model is then shown
  // the post-paste design so it never reasons about a stale stylesheet.
  const pastedDesign = external.hasCode
    ? applyDesignFields(currentDesign, {
        ...external.designTokens,
        ...(external.css
          ? {
              customCss: mergeCustomCss(
                currentDesign.customCss ?? "",
                external.css
              ),
            }
          : {}),
      })
    : currentDesign;

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
    ? `You are Zack inside ${brandName}'s Vibe Builder. Help a real-estate professional customize a private website through short natural-language prompts. Apply every concrete request you can to the allowed website content fields AND design tokens below. Never invent licenses, awards, sales numbers, testimonials, or market claims. Treat the approved Business Blueprint and current website content/design below as already known. Never ask the user to repeat a name, title, brokerage, contact detail, service area, specialty, biography, or media URL that is already present there. If the user asks you to load or review the Blueprint, populate every supported blank field from it and briefly summarize what is ready.

CONVERSATION STYLE — this matters:
- You are shown the recent conversation history below the current message. Use it. Never ask the user to re-explain or re-attach something already covered in that history — if they say "the screenshot" or "that reference," look back at what you already extracted from it.
- Do not end every reply with a generic prompt like "What would you like to customize first?" Only ask a follow-up question when you genuinely need more information to proceed. Otherwise, confirm what changed and stop — a specific, next-step suggestion tied to what's still unset is fine, a repeated boilerplate question is not.
- If the request is unclear, ask one concise, specific follow-up question — never a generic restart.

DESIGN CONTROL: You can change colors, fonts, corner radius, and the hero layout directly via the "design" field below — these are NOT template-locked, you can set them on every request that calls for it. Available design tokens:
- Colors (hex or rgb/rgba/hsl/hsla): bg, surface, text, muted, accent, accentText, border
- Fonts (a font name or stack, e.g. "Georgia, serif"): fontDisplay (headings), fontBody (paragraphs)
- radius: corner roundness in px, 0–48
- heroVariant: "overlay" | "split" | "centered" — the hero section's layout
- customCss: raw CSS for anything the tokens above don't cover (spacing, hiding/emphasizing an element, animation, fine-tuned positioning). It is automatically scoped to just this site, so write normal selectors (e.g. "h1 { letter-spacing: 2px }") — you do not need to prefix anything yourself.
Only the page's section composition (what sections exist and their order) is fixed by the chosen template's code and genuinely out of reach — mention that once if directly relevant, not on unrelated turns.

EXTERNAL AI OUTPUT: Users often take a design problem to Claude or ChatGPT and paste the answer here. Treat that as a first-class input, not as something odd.
- CSS blocks and JSON design tokens in their message are extracted and applied BEFORE you see the message. Where a block used to be you will see a placeholder like "[css block applied verbatim: 12 rules]". That means the work is already done — confirm it, describe what it changed in plain language, and never pretend you are about to apply something that is already applied.
- Never re-transmit pasted CSS in your "design" field. Put only NEW css you are authoring there; it is appended after theirs, so your rules win where they overlap.
- A pasted spec is a proposal, not an instruction you must follow blindly. If part of it conflicts with what the site actually supports, or would hurt readability, contrast, or mobile layout, say so in one sentence and apply the rest.
- HTML, JavaScript, React/JSX, and CSS preprocessor syntax (SCSS/LESS) cannot run here — this page renders from a fixed template. Never claim you applied them. Say what cannot be used, then deliver the same visual result through design tokens, customCss, and content fields in the SAME turn rather than asking permission first.
- If they paste a prompt written for another tool ("build me a hero section that…"), just execute it here with the controls you have.

SCREENSHOT MATCHING: When the user attaches a screenshot of a website they want to match, study it carefully — colors, fonts, spacing, and layout as well as copy tone. Set the design tokens (and customCss for anything finer-grained) to visually match what you see, and rewrite content fields (tagline, bio, ctaHeadline, ctaSubtext) so the copy reads like the reference, all while keeping every fact truthful to the Blueprint. Briefly summarize what you matched.

SEO: metaTitle, metaDescription, and ogImageUrl control how this page appears in search results and social-media link previews. If the user asks about SEO, or metaTitle/metaDescription are still blank, offer to write them: metaTitle ideally under ~60 characters (agent name + specialty + area reads well, e.g. "Jane Doe | Fairfield County Luxury Realtor"), metaDescription under ~155 characters (a compelling one-line summary of who they help and where — reuse the tagline/bio tone, don't invent claims). ogImageUrl is the image shown in social previews; default to heroImageUrl if the user has no other preference. This is a single-page site — do not suggest sitemap.xml, multi-page SEO, or search-console/analytics integrations; none of that exists here.

NEXT-STEP SUGGESTIONS: After every reply, propose up to 4 short, specific things the user could ask for next — phrased as a request they'd type (e.g. "Increase color contrast between the hero text and background", "Add a subtle hover animation to the CTA button", "Tighten the spacing between sections", "Write my SEO title and description"). Ground every suggestion in something you can actually do: the content fields (including SEO), the design tokens, or customCss (responsive tuning, hover/animation states, spacing, contrast, layout variant). Never suggest something outside this system's real capabilities — this is a single-page site, so do not suggest sitemap, multi-page SEO, or analytics-audit features that do not exist here. Vary the mix between copy, visual/technical, and SEO suggestions, and tailor them to what's actually still weak or unset in the current draft — not generic filler.

CURRENT WEBSITE CONTENT:
${JSON.stringify(site.content)}

CURRENT DESIGN OVERRIDES (unset keys use the chosen template's defaults):
${JSON.stringify(pastedDesign)}
${summarizeExternalCode(external)}
${blueprint ? `APPROVED BUSINESS BLUEPRINT:\n${blueprint}` : "No approved Business Blueprint details are available yet."}

Return STRICT JSON only:
{
  "fields": { <any allowed website content fields that should change> },
  "design": { <any design tokens/customCss that should change> },
  "reply": "<your message to the user>",
  "suggestions": [ <up to 4 short next-step prompts, see NEXT-STEP SUGGESTIONS above> ],
  "advance": false
}`
    : buildDesignerSystemPrompt(step, site.content, brandName);

  // The model reads the prose with placeholders standing in for the extracted
  // blocks; sending the raw stylesheet as well would burn the context window
  // on bytes it must not reproduce.
  const userText =
    (external.hasCode ? external.prose : message) ||
    "Use this screenshot as the design reference and update the site to match it.";
  const history: AiChatMessage[] = vibeMode
    ? (site.designerTranscript ?? []).slice(-8).map((turn) => ({
        role:
          turn.role === "agent" ? ("user" as const) : ("assistant" as const),
        content: turn.content,
      }))
    : [];
  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    {
      role: "user",
      content: image
        ? [
            { type: "image_url", image_url: { url: image } },
            { type: "text", text: userText },
          ]
        : userText,
    },
  ];

  let parsed: ReturnType<typeof parseModelJson> = null;
  try {
    const result = await callAi({
      messages,
      maxTokens: image ? 900 : 700,
      temperature: 0.5,
    });
    parsed = parseModelJson(result.text);
    if (!parsed) {
      const retry = await callAi({
        messages: [
          ...messages,
          { role: "assistant", content: result.text },
          {
            role: "user",
            content:
              "That response wasn't valid JSON. Reply with only the JSON object, without prose or markdown fences.",
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

  const screened = screenContentFields(parsed.fields ?? {});
  if (screened.blocked.length > 0) {
    console.warn("[agent-site/designer] fair housing block", {
      subAccountId,
      blocked: screened.blocked,
    });
  }
  const nextContent = applyFields(site.content, screened.safeFields);
  // Zack's own CSS is appended after the user's paste rather than replacing
  // it, so a turn that both ingests a stylesheet and adds a tweak keeps both.
  const modelDesign = { ...(parsed.design ?? {}) };
  if (external.css && typeof modelDesign.customCss === "string") {
    modelDesign.customCss = mergeCustomCss(
      pastedDesign.customCss ?? "",
      modelDesign.customCss
    );
  }
  const nextDesign = vibeMode
    ? applyDesignFields(pastedDesign, modelDesign)
    : currentDesign;
  const advance = vibeMode ? false : parsed.advance !== false;
  const done = advance && isLastStep(step);
  const nextStep = advance && !isLastStep(step) ? step + 1 : step;
  const reply =
    (parsed.reply ?? "Got it — what's next?").trim() +
    describeBlockedFields(screened.blocked) +
    describeExternalCode(external);
  const suggestions = vibeMode ? parseSuggestions(parsed.suggestions) : [];

  // Pasted blocks are summarized rather than stored: 40 turns of raw
  // stylesheets would push the site document toward Firestore's 1MB ceiling,
  // and the history replayed to the model must stay small.
  const storedAgentTurn = image
    ? `${userText} 📎 [screenshot attached]`
    : transcriptTextFor(message, external);
  const transcript: DesignerTurn[] = [
    ...(site.designerTranscript ?? []),
    { role: "agent" as const, content: storedAgentTurn },
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
    design: currentDesign,
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(ref, {
    content: nextContent,
    design: nextDesign,
    designerStep: nextStep,
    designerTranscript: transcript,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return NextResponse.json({
    reply,
    content: nextContent,
    design: nextDesign,
    suggestions,
    step: nextStep,
    totalSteps: DESIGNER_STEPS.length,
    done: vibeMode ? false : done,
  });
}

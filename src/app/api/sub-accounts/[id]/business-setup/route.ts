import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { aiIsConfigured, callAi, type AiChatMessage } from "@/lib/comms/ai/openrouter";
import {
  websiteStudioGateOpen,
  WEBSITE_STUDIO_LOCKED_MESSAGE,
} from "@/lib/website-studio/gate";
import { BUSINESS_SETUP_KB } from "@/lib/website-studio/business-setup-kb";

/**
 * POST /api/sub-accounts/[id]/business-setup
 *
 * The Business Setup assistant — answers A2P 10DLC / chat-widget / SEO / GBP
 * setup questions grounded in BUSINESS_SETUP_KB. Bundled under Website Studio,
 * so it's gated by the same paid add-on. 503 when OpenRouter is unset; never
 * returns a fabricated answer.
 */

const MAX_QUESTION_LEN = 1000;
const MAX_HISTORY_TURNS = 8;

function sanitizeHistory(raw: unknown): AiChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: AiChatMessage[] = [];
  for (const item of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role === "user" || role === "assistant") && typeof content === "string") {
      const trimmed = content.trim().slice(0, MAX_QUESTION_LEN);
      if (trimmed) out.push({ role, content: trimmed });
    }
  }
  return out;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  if (!(await websiteStudioGateOpen(subAccountId))) {
    return NextResponse.json({ error: WEBSITE_STUDIO_LOCKED_MESSAGE }, { status: 403 });
  }
  if (!aiIsConfigured()) {
    return NextResponse.json(
      { error: "The Setup assistant isn't available yet (OpenRouter isn't configured)." },
      { status: 503 },
    );
  }

  let body: { question?: unknown; history?: unknown; brandName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LEN) {
    return NextResponse.json(
      { error: `Question must be ${MAX_QUESTION_LEN} characters or fewer.` },
      { status: 400 },
    );
  }
  const brandName =
    typeof body.brandName === "string" && body.brandName.trim()
      ? body.brandName.trim().slice(0, 80)
      : "your CRM";

  const systemPrompt = `You are the Business Setup assistant for ${brandName}, a real estate CRM. You help agents set up the essentials: A2P 10DLC SMS registration, the website chat widget, local SEO, and Google Business Profile.

Answer ONLY using the HELP CONTENT below. Be concise and practical — exact steps, in order, with the specific menu path or dashboard. Never invent settings, prices, timelines, or requirements that aren't in the HELP CONTENT.

If the answer isn't covered, say: "I don't have that in my setup guide — check the video walkthroughs or reach out to support." Do not guess.

--- HELP CONTENT ---
${BUSINESS_SETUP_KB}
--- END HELP CONTENT ---`;

  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...sanitizeHistory(body.history),
    { role: "user", content: question },
  ];

  try {
    const result = await callAi({ messages, maxTokens: 550, temperature: 0.3 });
    return NextResponse.json({ answer: result.text });
  } catch (err) {
    console.error("[business-setup] LLM failed", err);
    return NextResponse.json(
      { error: "The assistant had trouble responding. Try again." },
      { status: 502 },
    );
  }
}

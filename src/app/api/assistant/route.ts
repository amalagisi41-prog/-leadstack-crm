import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { aiIsConfigured, callAi, type AiChatMessage } from "@/lib/comms/ai/openrouter";
import { ZACK_PRODUCT_KB } from "@/lib/assistant/zack-kb";
import type { BusinessProfileContent } from "@/types/business-profile";

/**
 * POST /api/assistant
 *
 * The in-app "Ask Zack" assistant available from the header + sidebar
 * on every dashboard page. Unlike /api/onboarding/help (setup Q&A grounded
 * in a fixed KB), this is the operator's working assistant: it knows their
 * Business Profile and helps with day-to-day work — drafting emails,
 * follow-up plans, appointment prep. In "studio" mode (Website Studio,
 * Social Planner, Funnels, Broadcasts, Templates pages) it additionally
 * acts as a marketing + design assistant.
 *
 * Auth: middleware attaches x-user-uid. When a subAccountId is provided the
 * caller's membership is verified before the Business Profile is read.
 *
 * Body: { question, history?, subAccountId?, mode?: "crm"|"studio", firstName?, currentPath? }
 * Returns: { answer }  (503 when OpenRouter isn't configured)
 */

const MAX_QUESTION_LEN = 2000;
const MAX_HISTORY_TURNS = 10;

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

function profileContext(p: Partial<BusinessProfileContent>): string {
  const lines: string[] = [];
  const add = (label: string, v: string | undefined) => {
    if (v && v.trim()) lines.push(`${label}: ${v.trim().slice(0, 300)}`);
  };
  add("Agent name", p.agentName);
  add("Title", p.title);
  add("Brokerage", p.brokerage);
  add("Phone", p.phone);
  add("Email", p.email);
  add("Website", p.website);
  add("Service areas", p.serviceAreas);
  add("Specialties", p.specialties);
  add("Price ranges", p.priceRanges);
  add("Business hours", p.businessHours);
  add("Bio", p.bio);
  if (!lines.length) return "";
  return `\n\n--- OPERATOR'S BUSINESS PROFILE ---\n${lines.join("\n")}\n--- END BUSINESS PROFILE ---`;
}

export async function POST(request: Request) {
  if (!request.headers.get("x-user-uid")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!aiIsConfigured()) {
    return NextResponse.json(
      { error: "Zack isn't available yet — OpenRouter isn't configured on this deployment." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LEN) {
    return NextResponse.json(
      { error: `Message must be ${MAX_QUESTION_LEN} characters or fewer.` },
      { status: 400 },
    );
  }

  const mode = body.mode === "studio" ? "studio" : "crm";
  const firstName =
    typeof body.firstName === "string" && body.firstName.trim()
      ? body.firstName.trim().slice(0, 60)
      : "";
  const currentPath =
    typeof body.currentPath === "string" && body.currentPath.startsWith("/")
      ? body.currentPath.trim().slice(0, 300)
      : "/dashboard";

  // Optional tenancy context — verify membership before reading the profile.
  let context = "";
  const subAccountId =
    typeof body.subAccountId === "string" && body.subAccountId.trim()
      ? body.subAccountId.trim()
      : null;
  if (subAccountId) {
    const access = await requireSubAccountMember(request, subAccountId);
    if (access instanceof NextResponse) return access;
    const snap = await getAdminDb()
      .doc(`subAccounts/${subAccountId}/businessProfile/main`)
      .get();
    if (snap.exists) {
      context = profileContext(snap.data() as Partial<BusinessProfileContent>);
    }
  }

  const studioRails =
    mode === "studio"
      ? `\n\nYou are currently in the operator's marketing Studio. In addition to CRM help, act as their marketing and design assistant: write listing descriptions, social captions, ad copy, email campaigns, and landing-page copy in their brand voice; advise on page layout, imagery, color, and typography choices; and suggest which lead-capture systems or funnels fit their goal. When writing copy, produce ready-to-paste text.`
      : "";

  const systemPrompt = `Your name is Zack. You are the operator's personal AgentStack product guide and working assistant${firstName ? `, speaking with ${firstName}` : ""}. You help the AGENT use AgentStack to run their real-estate business — you are not talking to their leads.

PRODUCT HELP IS YOUR FIRST PRIORITY. For questions about setup, migration, navigation, or how to do something, ground the answer in the product guide and the operator's current screen. Give the exact AgentStack action before background information. Do not replace a supported AgentStack workflow with generic advice.

Current screen: ${currentPath}

--- AGENTSTACK PRODUCT GUIDE ---
${ZACK_PRODUCT_KB}
--- END PRODUCT GUIDE ---

You can also draft emails and SMS follow-ups, plan next steps for a client, prep them for appointments and listing presentations, and summarize what to focus on. Be concise, concrete, and action-first. Use short paragraphs or tight numbered steps. When drafting a message, output ready-to-send text. Never invent client data or product capabilities. If essential information is missing, ask one short clarifying question.${studioRails}${context}

Today's date: ${new Date().toISOString().slice(0, 10)}.`;

  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...sanitizeHistory(body.history),
    { role: "user", content: question },
  ];

  try {
    const result = await callAi({ messages, maxTokens: 900 });
    return NextResponse.json({ answer: result.text });
  } catch (err) {
    console.error("[assistant] LLM call failed", err);
    return NextResponse.json(
      { error: "I had trouble reaching the AI service. Try again in a moment." },
      { status: 502 },
    );
  }
}

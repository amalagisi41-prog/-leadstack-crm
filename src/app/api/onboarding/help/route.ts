import "server-only";

import { NextResponse } from "next/server";
import { aiIsConfigured, callAi, type AiChatMessage } from "@/lib/comms/ai/openrouter";
import { ONBOARDING_HELP_KB } from "@/lib/onboarding/help-kb";

/**
 * POST /api/onboarding/help
 *
 * Operator-facing onboarding help assistant. A logged-in agent asks a
 * "how do I…" setup question and gets an answer grounded in
 * ONBOARDING_HELP_KB — so it backs up the walkthrough videos with instant,
 * accurate Q&A instead of hallucinating.
 *
 * Auth: middleware protects this route (not a public path) and attaches
 * x-user-uid, so any authenticated operator can use it. No tenancy needed —
 * the help content is the same for everyone.
 *
 * Body: { question: string; history?: {role,content}[]; brandName?: string }
 * Returns: { answer: string }  (503 when OPENROUTER_API_KEY isn't set)
 */

const MAX_QUESTION_LEN = 1000;
const MAX_HISTORY_TURNS = 8;

interface HelpBody {
  question?: unknown;
  history?: unknown;
  brandName?: unknown;
}

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

export async function POST(request: Request) {
  // Auth is enforced by middleware; this header presence is a belt-and-braces
  // check so a misconfig can't turn the endpoint anonymous.
  if (!request.headers.get("x-user-uid")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!aiIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "The help assistant isn't available on this deployment yet (OpenRouter isn't configured). Use the video walkthroughs or contact support.",
      },
      { status: 503 },
    );
  }

  let body: HelpBody;
  try {
    body = (await request.json()) as HelpBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
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

  const systemPrompt = `You are the setup assistant for ${brandName}, a real estate CRM. You help a new agent (the operator) configure and use the software — NOT their leads.

Answer ONLY using the HELP CONTENT below. Be concise and practical: give the exact menu path and steps. Use short numbered steps when there's a sequence. Never invent features, settings, prices, or menu items that aren't in the HELP CONTENT.

If the answer isn't covered, say: "I don't have that in my setup guide — check the video walkthroughs on your dashboard or reach out to support." Do not guess.

--- HELP CONTENT ---
${ONBOARDING_HELP_KB}
--- END HELP CONTENT ---`;

  const messages: AiChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...sanitizeHistory(body.history),
    { role: "user", content: question },
  ];

  try {
    const result = await callAi({ messages, maxTokens: 500, temperature: 0.3 });
    return NextResponse.json({ answer: result.text });
  } catch (err) {
    console.error("[onboarding/help] LLM call failed", err);
    return NextResponse.json(
      {
        error:
          "The assistant had trouble responding just now. Try again, or use the video walkthroughs.",
      },
      { status: 502 },
    );
  }
}

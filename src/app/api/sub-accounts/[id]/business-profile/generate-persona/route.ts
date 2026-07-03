import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { aiIsConfigured, callAi } from "@/lib/comms/ai/openrouter";
import { upsertAgentProfile } from "@/lib/comms/ai/agent";
import { compileBusinessProfilePrompt } from "@/lib/business-profile/compile";
import type { BusinessProfileContent } from "@/types/business-profile";
import type { SubAccountDoc } from "@/types";

/**
 * Turn the Business Profile into a ready-to-use AI persona.
 *
 * "Because the Knowledge Base already exists, AI setup is confirm-and-go."
 * POST reads the saved profile, asks the LLM to draft a concise receptionist
 * persona grounded in it, and (when `apply` is true) writes that persona to
 * the shared AI agent profile so every channel is instantly live. Returns
 * the draft either way so the operator can review before applying.
 */

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  if (!aiIsConfigured()) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not set on this deployment." },
      { status: 503 },
    );
  }

  let body: { apply?: boolean };
  try {
    body = (await request.json().catch(() => ({}))) as { apply?: boolean };
  } catch {
    body = {};
  }

  const db = getAdminDb();
  const [bizSnap, saSnap] = await Promise.all([
    db.doc(`subAccounts/${id}/businessProfile/main`).get(),
    db.doc(`subAccounts/${id}`).get(),
  ]);
  if (!bizSnap.exists) {
    return NextResponse.json(
      { error: "Fill in your Business Profile first." },
      { status: 400 },
    );
  }
  const profile = bizSnap.data() as BusinessProfileContent;
  const compiled = compileBusinessProfilePrompt(profile);
  if (!compiled) {
    return NextResponse.json(
      { error: "Add a few details to your Business Profile first." },
      { status: 400 },
    );
  }
  const businessName =
    profile.agentName.trim() ||
    (saSnap.data() as SubAccountDoc | undefined)?.name ||
    "the agent";

  try {
    const completion = await callAi({
      messages: [
        {
          role: "system",
          content:
            "You write concise system prompts (personas) for a real-estate AI assistant. Output ONLY the persona text — no preamble, no headings, no quotes. 120-200 words. Second person ('You are…'). Define who the assistant represents, its job across chat/SMS/voice (greet leads, answer questions, qualify, book, follow up), and its tone. Do NOT restate the raw profile fields — the assistant is given those separately; your job is the voice and behavior that sits on top of them.",
        },
        {
          role: "user",
          content: `Write the persona for ${businessName}'s AI assistant. Base the tone and behavior on this business profile:\n\n${compiled}`,
        },
      ],
    });

    const persona = completion.text.trim();
    if (body.apply && persona) {
      await upsertAgentProfile(id, {
        systemPrompt: persona,
        businessName,
      });
    }

    return NextResponse.json({
      ok: true,
      persona,
      applied: !!body.apply,
      model: completion.model,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not generate.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

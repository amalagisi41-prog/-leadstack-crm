import "server-only";

import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { aiIsConfigured, callAi } from "@/lib/comms/ai/openrouter";

interface Replacement {
  find: string;
  replace: string;
}

function parseJson(text: string): {
  reply?: string;
  css?: string;
  replacements?: Replacement[];
} | null {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    return JSON.parse(fenced ?? text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  if (!aiIsConfigured())
    return NextResponse.json(
      { error: "AI Website Coder is not configured." },
      { status: 503 }
    );

  const body = (await request.json().catch(() => ({}))) as {
    page?: unknown;
    message?: unknown;
  };
  const page = Math.max(0, Number(body.page ?? 0));
  const message =
    typeof body.message === "string" ? body.message.trim().slice(0, 3000) : "";
  if (!message)
    return NextResponse.json({ error: "Describe a change." }, { status: 400 });

  const snapshotRef = getAdminDb()
    .doc(`subAccounts/${id}/websiteTransfers/current`)
    .collection("snapshots")
    .doc(String(page));
  const snapshot = await snapshotRef.get();
  const htmlGzip = snapshot.data()?.htmlGzip;
  if (typeof htmlGzip !== "string")
    return NextResponse.json(
      { error: "The imported page snapshot is unavailable." },
      { status: 404 }
    );

  const html = gunzipSync(Buffer.from(htmlGzip, "base64")).toString("utf8");
  const existingCss = String(snapshot.data()?.customCss ?? "").slice(0, 20_000);
  const existingReplacements = Array.isArray(snapshot.data()?.replacements)
    ? (snapshot.data()?.replacements as Replacement[]).slice(0, 40)
    : [];
  const result = await callAi({
    maxTokens: 1800,
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content: `You are AgentStack AI Website Coder—not Zack. Modify an imported website faithfully from natural-language instructions. Return strict JSON only with: {"reply":"brief result","css":"complete cumulative CSS override","replacements":[{"find":"exact existing text","replace":"new text"}]}. Use CSS for visual/layout/font/color/responsive changes. Use exact text replacements for content changes. Preserve existing functionality and branding unless asked. Never add scripts, remote code, credentials, claims, licenses, testimonials, or tracking. Keep prior CSS unless the user asks to undo it. Replacements must use exact strings present in the supplied HTML and must be short.`,
      },
      {
        role: "user",
        content: `REQUEST:\n${message}\n\nCURRENT OVERRIDE CSS:\n${existingCss}\n\nCURRENT REPLACEMENTS:\n${JSON.stringify(existingReplacements)}\n\nIMPORTED HTML (may be truncated):\n${html.slice(0, 45_000)}`,
      },
    ],
  });
  const parsed = parseJson(result.text);
  if (!parsed)
    return NextResponse.json(
      { error: "The AI Website Coder returned an invalid edit." },
      { status: 502 }
    );

  const css =
    typeof parsed.css === "string" ? parsed.css.slice(0, 20_000) : existingCss;
  const replacements = Array.isArray(parsed.replacements)
    ? parsed.replacements
        .filter(
          (item) =>
            item &&
            typeof item.find === "string" &&
            typeof item.replace === "string" &&
            item.find.length > 0 &&
            item.find.length <= 500 &&
            item.replace.length <= 2000
        )
        .slice(0, 40)
    : existingReplacements;
  await snapshotRef.set(
    {
      customCss: css,
      replacements,
      editedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return NextResponse.json({
    reply: parsed.reply ?? "The private coded preview has been updated.",
  });
}

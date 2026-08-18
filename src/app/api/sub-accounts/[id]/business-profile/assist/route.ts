import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import { aiIsConfigured, callAi } from "@/lib/comms/ai/openrouter";
import { compileBusinessProfilePrompt } from "@/lib/business-profile/compile";
import {
  EMPTY_BUSINESS_PROFILE,
  type BusinessProfileContent,
} from "@/types/business-profile";
import { recordAiUsage } from "@/lib/comms/ai/usage";
import {
  AI_FAILURE_CODES,
  aiFailureMessage,
  aiFailureStatus,
  classifyAiError,
} from "@/lib/comms/ai/ai-failure";

const ALLOWED_FIELDS = new Set<keyof BusinessProfileContent>([
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
  "handoffRules",
  "escalationRules",
  "qualificationRules",
  "brokerageDisclosure",
  "optOutLanguage",
  "bio",
  "vendors",
  "testimonials",
  "buyerProcess",
  "sellerProcess",
  "listingCopyStyle",
  "scripts",
]);

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  if (!aiIsConfigured())
    return NextResponse.json(
      { error: "AI assist is not configured." },
      { status: 503 }
    );

  const body = (await request.json().catch(() => null)) as {
    field?: unknown;
    label?: unknown;
    currentValue?: unknown;
  } | null;
  const field =
    typeof body?.field === "string"
      ? (body.field as keyof BusinessProfileContent)
      : null;
  if (!field || !ALLOWED_FIELDS.has(field))
    return NextResponse.json(
      { error: "That field cannot be drafted." },
      { status: 400 }
    );

  const snap = await getAdminDb()
    .doc(`subAccounts/${id}/businessProfile/main`)
    .get();
  const profile = {
    ...EMPTY_BUSINESS_PROFILE,
    ...(snap.data() ?? {}),
  } as BusinessProfileContent;
  const blueprint = compileBusinessProfilePrompt(profile);
  let completion: Awaited<ReturnType<typeof callAi>>;
  try {
    completion = await callAi({
      maxTokens: 350,
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You are Zack inside AgentStack. Draft one accurate Business Blueprint field using only the supplied approved profile facts. Never invent licenses, credentials, statistics, service areas, prices, testimonials, contact details, or compliance claims. Return only the field value, with no label or markdown.",
        },
        {
          role: "user",
          content: `Field: ${String(body?.label ?? field)}\nCurrent value: ${String(body?.currentValue ?? "")}\n\nApproved Business Blueprint:\n${blueprint || "No approved facts yet. Improve only the current value; if it is blank, say what information the user should enter rather than inventing it."}`,
        },
      ],
    });
  } catch (error) {
    // Same defect class as the Blueprint import: an unguarded callAi throw
    // becomes a 500 with an empty body, which the browser surfaces as a raw
    // JSON parse error rather than anything the operator can act on.
    const failure = classifyAiError(error);
    console.error(`business-profile assist failed (${failure})`, error);
    return NextResponse.json(
      { error: aiFailureMessage(failure), code: AI_FAILURE_CODES[failure] },
      { status: aiFailureStatus(failure) }
    );
  }
  void recordAiUsage({ subAccountId: id, feature: "field_assist", completion });
  return NextResponse.json({
    value: completion.text.trim().replace(/^['"]|['"]$/g, ""),
  });
}

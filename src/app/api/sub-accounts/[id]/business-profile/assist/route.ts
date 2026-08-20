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

/** Safe onboarding defaults: workflow guidance, never regulated identity facts. */
const INDUSTRY_RECOMMENDATIONS: Partial<Record<keyof BusinessProfileContent, string>> = {
  businessHours: "Mon–Sat, 9:00 AM–6:00 PM; Sunday by appointment",
  responsePreference: "Respond within one business hour; text first, then call",
  handoffRules:
    "Hand off when the lead is ready to make an offer or asks for legal or contract details",
  escalationRules:
    "Escalate when a hot lead requests a same-day showing or a lead is upset",
  qualificationRules:
    "Ask about budget, timeline, financing or pre-approval, property type, and motivation",
  optOutLanguage: "Reply STOP to opt out",
};

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
  // A blank field has no approved source to draft from. Do not send the rest
  // of the Blueprint (especially phone/email) to a model and let it turn the
  // gap into a request to contact the agent. The UI can show this guidance
  // without writing it into the Blueprint as stray text.
  const currentValue = String(body?.currentValue ?? "").trim();
  if (!currentValue && !String(profile[field] ?? "").trim()) {
    const recommendation = INDUSTRY_RECOMMENDATIONS[field];
    if (recommendation) {
      return NextResponse.json({ value: recommendation, recommended: true });
    }
    return NextResponse.json({
      value: null,
      message: `No approved ${String(body?.label ?? field).toLowerCase()} information is available in the Business Blueprint yet.`,
    });
  }
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
            "You are Zack inside AgentStack. Draft one accurate Business Blueprint field using only the supplied approved profile facts. Never invent licenses, credentials, statistics, service areas, prices, testimonials, contact details, or compliance claims. Never reveal phone numbers or email addresses and never tell the user to contact the agent. Return only the field value, with no label or markdown.",
        },
        {
          role: "user",
          content: `Field: ${String(body?.label ?? field)}\nCurrent value: ${currentValue}\n\nApproved Business Blueprint:\n${blueprint || "No approved facts yet."}`,
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

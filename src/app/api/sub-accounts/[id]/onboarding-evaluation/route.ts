import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import {
  evaluateOnboardingJourney,
  type JourneyEvent,
  type JourneyEventName,
  type OnboardingJourney,
} from "@/lib/onboarding/journey-evaluation";

const EVENTS = new Set<JourneyEventName>([
  "journey_started",
  "identity_completed",
  "preset_selected",
  "existing_site_verified",
  "trusted_preview",
  "lead_path_connected",
  "domain_ready",
  "release_approved",
  "published",
  "blocked",
  "support_requested",
  "rollback",
]);

async function journeyFor(id: string): Promise<OnboardingJourney> {
  const snap = await getAdminDb().doc(`subAccounts/${id}`).get();
  return snap.data()?.onboardingFoundation?.mode === "transfer"
    ? "existing_brand"
    : "new_business";
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const journey = await journeyFor(id);
  const snap = await getAdminDb()
    .collection(`subAccounts/${id}/onboardingJourneyEvents`)
    .get();
  const events = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      name: data.name as JourneyEventName,
      atMs: data.createdAt?.toMillis?.() ?? 0,
      detail: data.detail as string | undefined,
    } satisfies JourneyEvent;
  });
  return NextResponse.json({
    evaluation: evaluateOnboardingJourney(journey, events),
    events: events.length,
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;
  const body = (await request.json().catch(() => null)) as {
    event?: JourneyEventName;
    detail?: string;
  } | null;
  if (!body?.event || !EVENTS.has(body.event))
    return NextResponse.json(
      { error: "Unknown journey event" },
      { status: 400 }
    );
  await getAdminDb()
    .collection(`subAccounts/${id}/onboardingJourneyEvents`)
    .add({
      name: body.event,
      detail: body.detail?.trim().slice(0, 240) || null,
      actorUid: access.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  return NextResponse.json({ ok: true });
}

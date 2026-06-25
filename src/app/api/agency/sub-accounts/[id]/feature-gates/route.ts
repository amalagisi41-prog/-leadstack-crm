import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { removeSendingDomain } from "@/lib/comms/resend-domains";
import { metaAppConfigured } from "@/lib/comms/meta";
import type { ResendConfig } from "@/types";

/**
 * Agency-only feature gates per sub-account. Each gate is a boolean toggle
 * the agency owner controls. The payload is shaped as an object so
 * gates can be set independently (only the fields you send get applied)
 * or together in one round-trip from the Manage dialog.
 *
 * Today's gates:
 *   - `emailDomainEnabled` — dedicated Resend sending domain. Disabling
 *     tears down the verified domain (frees the Resend slot) and clears
 *     `resendConfig` so sends fall back to EMAIL_FROM immediately.
 *   - `apiAccessEnabled` — the public API (v1). Disabling 403s every
 *     `/api/v1/*` request and blocks new key / webhook mints, but
 *     PRESERVES existing keys + subscriptions so re-enabling resumes
 *     them instantly (no painful re-rotation of Zapier integrations).
 *   - `metaInboxEnabled` — BETA master switch for the Facebook Messenger +
 *     Instagram DM inbox channels. Pure toggle today (no consumer slices
 *     yet) so the feature stays inert + invisible while off.
 *
 * Auth: agency owner only (requireSubAccountMember + role check). Sub-account
 * admins can NOT flip their own gates — the whole point is that the agency
 * controls what its tenants can do.
 */

interface PatchBody {
  emailDomainEnabled?: boolean;
  apiAccessEnabled?: boolean;
  broadcastsEnabled?: boolean;
  outboundVoiceEnabled?: boolean;
  whatsappEnabled?: boolean;
  metaInboxEnabled?: boolean;
  websiteEnabled?: boolean;
  socialPlannerEnabled?: boolean;
  communityEnabled?: boolean;
  // "Hide instead of lock" overrides for the sidebar-gated features.
  // Only take effect while the matching gate is off. See `*HiddenWhenDisabled`
  // on SubAccountDoc.
  broadcastsHiddenWhenDisabled?: boolean;
  websiteHiddenWhenDisabled?: boolean;
  socialPlannerHiddenWhenDisabled?: boolean;
  communityHiddenWhenDisabled?: boolean;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  if (access.subAccountRole !== "agencyOwner") {
    return NextResponse.json(
      { error: "Agency owner only" },
      { status: 403 },
    );
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const wantsEmail = typeof body.emailDomainEnabled === "boolean";
  const wantsApi = typeof body.apiAccessEnabled === "boolean";
  const wantsBroadcasts = typeof body.broadcastsEnabled === "boolean";
  const wantsOutboundVoice = typeof body.outboundVoiceEnabled === "boolean";
  const wantsWhatsapp = typeof body.whatsappEnabled === "boolean";
  const wantsMetaInbox = typeof body.metaInboxEnabled === "boolean";
  const wantsWebsite = typeof body.websiteEnabled === "boolean";
  const wantsSocialPlanner = typeof body.socialPlannerEnabled === "boolean";
  const wantsCommunity = typeof body.communityEnabled === "boolean";
  const wantsBroadcastsHidden =
    typeof body.broadcastsHiddenWhenDisabled === "boolean";
  const wantsWebsiteHidden =
    typeof body.websiteHiddenWhenDisabled === "boolean";
  const wantsSocialPlannerHidden =
    typeof body.socialPlannerHiddenWhenDisabled === "boolean";
  const wantsCommunityHidden =
    typeof body.communityHiddenWhenDisabled === "boolean";
  if (
    !wantsEmail &&
    !wantsApi &&
    !wantsBroadcasts &&
    !wantsOutboundVoice &&
    !wantsWhatsapp &&
    !wantsMetaInbox &&
    !wantsWebsite &&
    !wantsSocialPlanner &&
    !wantsCommunity &&
    !wantsBroadcastsHidden &&
    !wantsWebsiteHidden &&
    !wantsSocialPlannerHidden &&
    !wantsCommunityHidden
  ) {
    return NextResponse.json(
      {
        error:
          "At least one of `emailDomainEnabled`, `apiAccessEnabled`, `broadcastsEnabled`, `outboundVoiceEnabled`, `whatsappEnabled`, `metaInboxEnabled`, `websiteEnabled`, `socialPlannerEnabled`, `broadcastsHiddenWhenDisabled`, `websiteHiddenWhenDisabled`, or `socialPlannerHiddenWhenDisabled` (boolean) is required.",
      },
      { status: 400 },
    );
  }

  // Meta features need app creds on the deployment. Refuse to ENABLE either
  // Meta gate when unconfigured (the UI grays these out; this guards the API).
  // Disabling is always allowed.
  if (
    (body.metaInboxEnabled === true || body.socialPlannerEnabled === true) &&
    !metaAppConfigured()
  ) {
    return NextResponse.json(
      {
        error:
          "Facebook/Instagram isn't configured on this deployment. Set META_APP_ID and META_APP_SECRET to enable the inbox or Social Planner.",
      },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const subRef = db.doc(`subAccounts/${subAccountId}`);
  const subSnap = await subRef.get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  const existingCfg = subSnap.data()?.resendConfig as
    | ResendConfig
    | null
    | undefined;

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  let clearedDomain = false;

  if (wantsEmail) {
    if (body.emailDomainEnabled) {
      updates.emailDomainEnabledByAgency = true;
    } else {
      // Disable: best-effort tear down the live Resend domain so the
      // agency account doesn't keep paying for a slot the sub-account
      // can no longer use. Runtime `tenantFrom()` short-circuits on the
      // falsy gate even if this cleanup blips.
      if (existingCfg?.domainId) {
        await removeSendingDomain(existingCfg.domainId);
        clearedDomain = true;
      }
      updates.emailDomainEnabledByAgency = false;
      updates.resendConfig = null;
    }
  }

  if (wantsApi) {
    // No tear-down on disable — keys + subscriptions stay so a quick
    // re-enable doesn't force the sub-account to re-rotate every
    // integration. Auth middleware refuses requests while the gate is
    // off, so old keys are inert until re-enabled.
    updates.apiAccessEnabledByAgency = body.apiAccessEnabled;
  }

  if (wantsBroadcasts) {
    // No tear-down — historical broadcast docs + in-flight QStash
    // messages aren't touched. New `/api/broadcasts/email/send` calls
    // are 403'd while the gate is off; re-enabling restores normal
    // behaviour immediately. In-flight batches that were scheduled
    // BEFORE the gate flipped continue to drain (the step executor
    // doesn't re-check the gate per recipient; that would slow every
    // send for the 99% case). Operators can cancel by deleting the
    // broadcast doc if a mid-batch stop is needed.
    updates.broadcastsEnabledByAgency = body.broadcastsEnabled;
  }

  if (wantsOutboundVoice) {
    // No tear-down — outbound reuses the same Vapi assistant + number as
    // inbound voice. Disabling just 403s the /api/comms/voice/call route;
    // re-enabling restores it instantly.
    updates.outboundVoiceEnabledByAgency = body.outboundVoiceEnabled;
  }

  if (wantsWhatsapp) {
    // No tear-down — WhatsApp reuses the sub-account's Twilio creds + sender
    // number (shared with SMS). Disabling 403s the channel-enable route and
    // makes the inbound WhatsApp webhook ignore this sub-account; re-enabling
    // restores it instantly without re-pasting any credentials.
    updates.whatsappEnabledByAgency = body.whatsappEnabled;
  }

  if (wantsMetaInbox) {
    // No tear-down — the beta Facebook Messenger + Instagram DM inbox channels
    // aren't provisioned yet (consumer slices land later). This is purely the
    // master switch: while off, nothing about the feature surfaces or runs.
    // Re-enabling once the channels ship will light them up instantly.
    updates.metaInboxEnabledByAgency = body.metaInboxEnabled;
  }

  if (wantsWebsite) {
    // No tear-down — the sub-account's website config + any already-published
    // gitpage site are left intact. Disabling just 403s the build route and
    // locks the Website sidebar entry; re-enabling restores it instantly.
    updates.websiteEnabledByAgency = body.websiteEnabled;
  }

  if (wantsSocialPlanner) {
    // No tear-down — the Meta connection + any scheduled posts are left
    // intact. Disabling 403s the connect/create/publish routes and locks the
    // Social Planner sidebar entry; re-enabling restores it instantly.
    updates.socialPlannerEnabledByAgency = body.socialPlannerEnabled;
  }

  if (wantsCommunity) {
    // No tear-down — members, posts, and courses are preserved. Disabling
    // locks the Community sidebar entry AND makes every `/c/*` page + community
    // API 404/403 (the gate is enforced on the public surface too), so a
    // disabled sub-account's groups are unreachable. Re-enabling resumes
    // instantly.
    updates.communityEnabledByAgency = body.communityEnabled;
  }

  // "Hide instead of lock" overrides. Pure presentation flags — they don't
  // change any runtime enforcement (a disabled feature's routes 403 the same
  // way regardless); they only decide whether the sidebar shows a greyed
  // "Locked" entry or omits it entirely. Persisted independently of the gate
  // so the agency owner can pre-set "hide" before flipping the feature off.
  if (wantsBroadcastsHidden) {
    updates.broadcastsHiddenWhenDisabled = body.broadcastsHiddenWhenDisabled;
  }
  if (wantsWebsiteHidden) {
    updates.websiteHiddenWhenDisabled = body.websiteHiddenWhenDisabled;
  }
  if (wantsSocialPlannerHidden) {
    updates.socialPlannerHiddenWhenDisabled =
      body.socialPlannerHiddenWhenDisabled;
  }
  if (wantsCommunityHidden) {
    updates.communityHiddenWhenDisabled = body.communityHiddenWhenDisabled;
  }

  await subRef.update(updates);

  return NextResponse.json({
    ok: true,
    ...(wantsEmail ? { emailDomainEnabled: body.emailDomainEnabled } : {}),
    ...(wantsApi ? { apiAccessEnabled: body.apiAccessEnabled } : {}),
    ...(wantsBroadcasts ? { broadcastsEnabled: body.broadcastsEnabled } : {}),
    ...(wantsOutboundVoice
      ? { outboundVoiceEnabled: body.outboundVoiceEnabled }
      : {}),
    ...(wantsWhatsapp ? { whatsappEnabled: body.whatsappEnabled } : {}),
    ...(wantsMetaInbox ? { metaInboxEnabled: body.metaInboxEnabled } : {}),
    ...(wantsWebsite ? { websiteEnabled: body.websiteEnabled } : {}),
    ...(wantsSocialPlanner
      ? { socialPlannerEnabled: body.socialPlannerEnabled }
      : {}),
    ...(wantsCommunity ? { communityEnabled: body.communityEnabled } : {}),
    ...(wantsBroadcastsHidden
      ? { broadcastsHiddenWhenDisabled: body.broadcastsHiddenWhenDisabled }
      : {}),
    ...(wantsWebsiteHidden
      ? { websiteHiddenWhenDisabled: body.websiteHiddenWhenDisabled }
      : {}),
    ...(wantsSocialPlannerHidden
      ? {
          socialPlannerHiddenWhenDisabled:
            body.socialPlannerHiddenWhenDisabled,
        }
      : {}),
    ...(wantsCommunityHidden
      ? { communityHiddenWhenDisabled: body.communityHiddenWhenDisabled }
      : {}),
    ...(clearedDomain ? { clearedDomain: true } : {}),
  });
}

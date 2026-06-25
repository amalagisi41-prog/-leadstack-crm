import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  requireSubAccountAdmin,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { publishSocialPost, qstashIsConfigured } from "@/lib/automations/qstash";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import { SOCIAL_CAPTION_MAX } from "@/types/social";
import type {
  MetaConfig,
  SocialPlatform,
  SocialPostDoc,
  SocialPostTargetResult,
  SubAccountDoc,
} from "@/types";

/**
 * Social Planner posts — per sub-account.
 *
 * GET  — list every post in the sub-account (member-readable; the calendar +
 *        list also stream over the client SDK).
 * POST — create a draft, or schedule a post to auto-publish at `scheduledAt`.
 *        Sub-account admin only. Gated on `socialPlannerEnabledByAgency`.
 *        Scheduling requires a connected Meta Page (and, for IG targets, a
 *        linked IG business account + image URL) and QStash configured.
 */

const PLATFORMS: SocialPlatform[] = ["facebook", "instagram"];

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const snap = await getAdminDb()
    .collection("socialPosts")
    .where("subAccountId", "==", subAccountId)
    .get();
  const posts = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<SocialPostDoc, "id">) }),
  );
  return NextResponse.json({ ok: true, posts });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const sub = subSnap.data() as SubAccountDoc;
  const agencyId = sub.agencyId;

  // Agency gate.
  if (sub.socialPlannerEnabledByAgency !== true) {
    return NextResponse.json(
      { error: "Social Planner is locked by your agency." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // ── Validate caption ──────────────────────────────────────────────
  const caption =
    typeof b.caption === "string" ? b.caption.trim() : "";
  if (caption.length > SOCIAL_CAPTION_MAX) {
    return NextResponse.json(
      { error: `Caption is too long (max ${SOCIAL_CAPTION_MAX} characters).` },
      { status: 400 },
    );
  }

  // ── Validate image URL ────────────────────────────────────────────
  let imageUrl: string | null = null;
  if (b.imageUrl != null && b.imageUrl !== "") {
    if (typeof b.imageUrl !== "string" || !/^https:\/\//i.test(b.imageUrl.trim())) {
      return NextResponse.json(
        { error: "Image URL must start with https://." },
        { status: 400 },
      );
    }
    imageUrl = b.imageUrl.trim().slice(0, 2000);
  }

  // ── Validate targets ──────────────────────────────────────────────
  const targets: SocialPlatform[] = Array.isArray(b.targets)
    ? PLATFORMS.filter((p) => (b.targets as unknown[]).includes(p))
    : [];

  // ── Validate status ───────────────────────────────────────────────
  const status = b.status === "scheduled" ? "scheduled" : "draft";

  // Drafts can be incomplete; scheduling enforces the full contract.
  if (status === "scheduled") {
    if (!caption && !imageUrl) {
      return NextResponse.json(
        { error: "Add a caption or an image before scheduling." },
        { status: 400 },
      );
    }
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one platform to publish to." },
        { status: 400 },
      );
    }
    if (targets.includes("instagram") && !imageUrl) {
      return NextResponse.json(
        { error: "Instagram posts require an image URL." },
        { status: 400 },
      );
    }

    // Connection checks against the shared Meta config — must be publish-capable.
    const meta = sub.metaConfig as MetaConfig | null | undefined;
    if (!metaCanPublish(meta) || !meta?.pageId) {
      return NextResponse.json(
        {
          error:
            "Connect a Facebook Page with posting permission first (Connections tab → Manage in Settings).",
        },
        { status: 400 },
      );
    }
    if (targets.includes("instagram") && !meta.instagramBusinessAccountId) {
      return NextResponse.json(
        {
          error:
            "No Instagram business account is linked to the connected Page. Reconnect or remove Instagram as a target.",
        },
        { status: 400 },
      );
    }
    if (!qstashIsConfigured()) {
      return NextResponse.json(
        {
          error:
            "Scheduling isn't available — QStash isn't configured on this deployment.",
        },
        { status: 503 },
      );
    }
  }

  // ── Validate schedule time ────────────────────────────────────────
  let scheduledAt: Date | null = null;
  let delaySeconds = 0;
  if (status === "scheduled") {
    const raw = typeof b.scheduledAt === "string" ? b.scheduledAt : "";
    const when = raw ? new Date(raw) : null;
    if (!when || Number.isNaN(when.getTime())) {
      return NextResponse.json(
        { error: "Pick a valid date and time to schedule." },
        { status: 400 },
      );
    }
    // Allow a small clock-skew grace; otherwise must be in the future.
    const nowMs = Date.now();
    if (when.getTime() < nowMs - 60_000) {
      return NextResponse.json(
        { error: "Scheduled time must be in the future." },
        { status: 400 },
      );
    }
    scheduledAt = when;
    delaySeconds = Math.max(0, Math.floor((when.getTime() - nowMs) / 1000));
  }

  // ── Write the doc (id first, so the QStash body can reference it) ──
  const ref = db.collection("socialPosts").doc();
  const results: SocialPostTargetResult[] = targets.map((platform) => ({
    platform,
    status: "pending",
    externalId: null,
    error: null,
  }));

  let qstashMessageId: string | null = null;
  if (status === "scheduled") {
    const scheduled = await publishSocialPost({
      postId: ref.id,
      subAccountId,
      delaySeconds,
    });
    if (!scheduled) {
      return NextResponse.json(
        { error: "Couldn't schedule the post. Please try again." },
        { status: 502 },
      );
    }
    qstashMessageId = scheduled.messageId;
  }

  const now = FieldValue.serverTimestamp();
  const docPayload: Omit<SocialPostDoc, "id"> = {
    agencyId,
    subAccountId,
    createdByUid: access.uid,
    caption,
    imageUrl,
    targets,
    status,
    // Admin SDK persists a JS Date as a Firestore Timestamp; the doc type
    // models the read shape (Timestamp), hence the cast.
    scheduledAt: (scheduledAt ??
      null) as unknown as SocialPostDoc["scheduledAt"],
    publishedAt: null,
    results,
    qstashMessageId,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(docPayload);

  return NextResponse.json({ ok: true, id: ref.id, status });
}

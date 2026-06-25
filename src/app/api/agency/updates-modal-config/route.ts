import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAgencyOwner } from "@/lib/auth/require-agency-owner";
import {
  UPDATES_MAX_ITEMS,
  UPDATES_HEADING_MAX,
  UPDATES_SUBHEADING_MAX,
  UPDATES_ITEM_TITLE_MAX,
  UPDATES_ITEM_DESC_MAX,
  UPDATES_ITEM_BADGE_MAX,
  UPDATES_DELAY_MAX_SECONDS,
  type UpdateItem,
} from "@/lib/updates-modal-config";

/**
 * Agency-owner-only editor for the landing page's "Updates" modal
 * (`appConfig/updatesModal`). Read publicly by the unauthenticated landing page
 * via the client hook; written here through the Admin SDK (bypasses the
 * `allow write: if false` rule). Mirrors the exit-intent-config route.
 */

const DOC_PATH = "appConfig/updatesModal";

interface PatchBody {
  enabled?: boolean;
  heading?: string;
  subheading?: string;
  delaySeconds?: number;
  items?: unknown;
}

export async function PATCH(request: Request) {
  const auth = await requireAgencyOwner(request);
  if (auth instanceof NextResponse) return auth;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: auth.uid,
  };

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json(
        { error: "`enabled` must be a boolean." },
        { status: 400 },
      );
    }
    updates.enabled = body.enabled;
  }

  if (body.heading !== undefined) {
    const heading =
      typeof body.heading === "string" ? body.heading.trim() : "";
    if (!heading || heading.length > UPDATES_HEADING_MAX) {
      return NextResponse.json(
        { error: `\`heading\` must be 1–${UPDATES_HEADING_MAX} characters.` },
        { status: 400 },
      );
    }
    updates.heading = heading;
  }

  if (body.subheading !== undefined) {
    const subheading =
      typeof body.subheading === "string" ? body.subheading.trim() : "";
    if (subheading.length > UPDATES_SUBHEADING_MAX) {
      return NextResponse.json(
        {
          error: `\`subheading\` must be ≤ ${UPDATES_SUBHEADING_MAX} characters.`,
        },
        { status: 400 },
      );
    }
    updates.subheading = subheading;
  }

  if (body.delaySeconds !== undefined) {
    const d = body.delaySeconds;
    if (
      typeof d !== "number" ||
      !Number.isInteger(d) ||
      d < 0 ||
      d > UPDATES_DELAY_MAX_SECONDS
    ) {
      return NextResponse.json(
        {
          error: `\`delaySeconds\` must be a whole number between 0 and ${UPDATES_DELAY_MAX_SECONDS}.`,
        },
        { status: 400 },
      );
    }
    updates.delaySeconds = d;
  }

  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { error: "`items` must be an array." },
        { status: 400 },
      );
    }
    if (body.items.length === 0) {
      return NextResponse.json(
        { error: "Add at least one update." },
        { status: 400 },
      );
    }
    if (body.items.length > UPDATES_MAX_ITEMS) {
      return NextResponse.json(
        { error: `At most ${UPDATES_MAX_ITEMS} updates.` },
        { status: 400 },
      );
    }

    const cleaned: UpdateItem[] = [];
    for (const raw of body.items) {
      if (!raw || typeof raw !== "object") {
        return NextResponse.json(
          { error: "Each update must be an object." },
          { status: 400 },
        );
      }
      const r = raw as Partial<UpdateItem>;
      const title = typeof r.title === "string" ? r.title.trim() : "";
      if (!title || title.length > UPDATES_ITEM_TITLE_MAX) {
        return NextResponse.json(
          {
            error: `Each update needs a title (1–${UPDATES_ITEM_TITLE_MAX} characters).`,
          },
          { status: 400 },
        );
      }
      const description =
        typeof r.description === "string" ? r.description.trim() : "";
      if (description.length > UPDATES_ITEM_DESC_MAX) {
        return NextResponse.json(
          {
            error: `A description must be ≤ ${UPDATES_ITEM_DESC_MAX} characters.`,
          },
          { status: 400 },
        );
      }
      const badge = typeof r.badge === "string" ? r.badge.trim() : "";
      if (badge.length > UPDATES_ITEM_BADGE_MAX) {
        return NextResponse.json(
          { error: `A badge must be ≤ ${UPDATES_ITEM_BADGE_MAX} characters.` },
          { status: 400 },
        );
      }
      cleaned.push({ title, description, badge });
    }
    updates.items = cleaned;
  }

  // Require at least one real field beyond the two audit stamps.
  if (Object.keys(updates).length <= 2) {
    return NextResponse.json(
      { error: "No valid fields to update." },
      { status: 400 },
    );
  }

  try {
    await getAdminDb().doc(DOC_PATH).set(updates, { merge: true });
  } catch (err) {
    console.error("[agency/updates-modal-config] write failed", err);
    return NextResponse.json({ error: "Save failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

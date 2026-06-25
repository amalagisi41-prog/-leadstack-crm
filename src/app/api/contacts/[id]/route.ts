import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  emitContactDeleted,
  updateContactServerSide,
  type UpdateContactPatch,
} from "@/lib/server/contacts-service";
import type { Contact } from "@/types/contacts";
import type { MemberStatus, Role } from "@/types";

/**
 * Delete a contact — but ONLY when nothing else points at it.
 *
 * Auth model: caller must be a sub-account ADMIN of the contact's
 * sub-account (or the agency owner). Collaborators can edit but not
 * delete — matches the rule for `contacts/{id}` where delete requires
 * canAdminSub.
 *
 * Reference guard (no cascade): the delete is refused with 409 when the
 * contact is still linked to a deal, task, calendar event / booking, quote
 * / invoice, form submission, web-chat conversation, or voice call. The
 * 409 body carries a `blockers` list (type + count) so the UI can explain
 * what to clear first. `?check=1` runs the same check as a dry-run (200
 * with `deletable` + `blockers`, no writes) for the confirm modal.
 *
 * When allowed, a recursive delete wipes the contact + its own
 * subcollections (notes / activities / messages) and fires contact.deleted.
 */

interface CallerClaims {
  status?: MemberStatus;
  agencyId?: string | null;
  agencyRole?: "owner" | "staff" | null;
  role?: Role;
}

async function readCaller(request: Request): Promise<
  | { uid: string; email: string; claims: CallerClaims }
  | NextResponse
> {
  const uid = request.headers.get("x-user-uid");
  if (!uid) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const auth = getAdminAuth();
  const record = await auth.getUser(uid).catch(() => null);
  if (!record) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const claims = (record.customClaims ?? {}) as CallerClaims;
  if (claims.status !== "active") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  return { uid, email: record.email ?? "", claims };
}

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Update a contact's plain fields + emit `contact.updated`. Any active
 * member may edit (matches the old client-SDK write rule). Territory moves
 * are NOT handled here — the dashboard routes those through the dedicated
 * territory fan-out endpoint.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = getAdminDb();
  const snap = await db.doc(`contacts/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const data = snap.data() as Omit<Contact, "id">;

  const access = await requireSubAccountMember(request, data.subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: UpdateContactPatch = {};
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 200);
  if (typeof body.email === "string") patch.email = str(body.email);
  if (typeof body.phone === "string") patch.phone = str(body.phone);
  if (typeof body.company === "string") patch.company = str(body.company);
  if (typeof body.address === "string") patch.address = str(body.address);
  if (typeof body.source === "string") patch.source = str(body.source);
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  if (body.pipelineStage === null || typeof body.pipelineStage === "string") {
    patch.pipelineStage =
      typeof body.pipelineStage === "string" ? body.pipelineStage : null;
  }

  const result = await updateContactServerSide({
    contactId: id,
    patch,
    mode: (data as { mode?: "live" | "test" }).mode ?? "live",
  });
  if (!result) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  return NextResponse.json({ contact: result.contact });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const caller = await readCaller(request);
  if (caller instanceof NextResponse) return caller;

  const db = getAdminDb();
  const contactRef = db.doc(`contacts/${id}`);
  const snap = await contactRef.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }
  const contact = snap.data() as Omit<Contact, "id">;
  const { agencyId, subAccountId } = contact;

  // Authorisation: agency owner of the contact's agency, OR sub-account
  // admin of the contact's sub-account.
  const isAgencyOwner =
    caller.claims.agencyRole === "owner" &&
    caller.claims.agencyId === agencyId;

  let isSubAccountAdmin = false;
  if (!isAgencyOwner) {
    const memberSnap = await db
      .doc(`subAccounts/${subAccountId}/subAccountMembers/${caller.uid}`)
      .get();
    const member = memberSnap.data();
    isSubAccountAdmin =
      memberSnap.exists &&
      member?.status === "active" &&
      member?.role === "admin";
  }

  if (!isAgencyOwner && !isSubAccountAdmin) {
    return NextResponse.json(
      { error: "Only sub-account admins can delete contacts." },
      { status: 403 },
    );
  }

  // Refuse deletion while the contact is still linked to other records.
  // We do NOT cascade — the operator must clear/reassign the links first.
  const blockers = await findContactBlockers(db, subAccountId, id);
  const checkOnly = new URL(request.url).searchParams.get("check") === "1";

  // Dry-run for the UI: report deletability without touching anything.
  if (checkOnly) {
    return NextResponse.json({ deletable: blockers.length === 0, blockers });
  }

  if (blockers.length > 0) {
    return NextResponse.json(
      {
        error:
          "This contact is linked to other records and can't be deleted. Remove or reassign them first.",
        blockers,
      },
      { status: 409 },
    );
  }

  // Nothing references the contact — safe to delete it and its own
  // subcollections (notes, activities, messages).
  await db.recursiveDelete(contactRef);

  // Fire contact.deleted from the pre-delete snapshot — by the time
  // subscribers react the doc is gone, so we serialize what we just read.
  emitContactDeleted({ subAccountId, agencyId, contactId: id, data: contact });

  return NextResponse.json({ ok: true, contactId: id });
}

interface ContactBlocker {
  type: string;
  /** Singular human label, e.g. "deal" → "2 deals". */
  label: string;
  count: number;
}

/**
 * Count every record that points at this contact across the resources a
 * delete must not orphan. Any non-zero count blocks the delete. Uses
 * count() aggregation so we never read the docs themselves.
 */
async function findContactBlockers(
  db: FirebaseFirestore.Firestore,
  subAccountId: string,
  contactId: string,
): Promise<ContactBlocker[]> {
  const inSub = (collection: string) =>
    db
      .collection(collection)
      .where("subAccountId", "==", subAccountId)
      .where("contactId", "==", contactId)
      .count()
      .get();

  const [deals, tasks, events, quotes, submissions, webChats, voiceCalls] =
    await Promise.all([
      inSub("deals"),
      inSub("tasks"),
      inSub("events"),
      inSub("quotes"),
      // Form submissions live in forms/{id}/submissions — a collection-group
      // query finds them across every form. contactId is a globally unique
      // doc id, so no sub-account filter is needed.
      db
        .collectionGroup("submissions")
        .where("contactId", "==", contactId)
        .count()
        .get(),
      db
        .collection("subAccounts")
        .doc(subAccountId)
        .collection("webChatSessions")
        .where("contactId", "==", contactId)
        .count()
        .get(),
      db
        .collection("subAccounts")
        .doc(subAccountId)
        .collection("voiceCalls")
        .where("contactId", "==", contactId)
        .count()
        .get(),
    ]);

  const out: ContactBlocker[] = [];
  const add = (count: number, type: string, label: string) => {
    if (count > 0) out.push({ type, label, count });
  };
  add(deals.data().count, "deals", "deal");
  add(tasks.data().count, "tasks", "task");
  add(events.data().count, "events", "calendar event / booking");
  add(quotes.data().count, "quotes", "quote / invoice");
  add(submissions.data().count, "form_submissions", "form submission");
  add(webChats.data().count, "web_chat_sessions", "web-chat conversation");
  add(voiceCalls.data().count, "voice_calls", "voice call");
  return out;
}

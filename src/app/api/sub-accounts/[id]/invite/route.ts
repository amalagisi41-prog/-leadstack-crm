import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite someone to a specific sub-account at a specific role
 * (admin | collaborator). Caller must be the agency owner OR an active
 * sub-account admin of the target sub-account.
 *
 * Writes a typed `invites/{auto}` doc that the signup route consumes when
 * the invitee creates their account, and (when Resend is configured) sends
 * a delivery email with a /signup?email=<addr> link.
 *
 * Idempotent on the (email, subAccountId) pair: if a pending invite already
 * exists, the doc is reused but the email is still re-sent so the admin can
 * use this endpoint as "resend" without revoking first.
 *
 * Graceful degrade: if RESEND_API_KEY isn't set, the invite doc is still
 * created and `mailed: false` is returned so the UI can prompt the admin to
 * copy the signup link manually.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: {
    email?: string;
    role?: "admin" | "collaborator";
    assignedTerritoryIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Provide a valid email address." },
      { status: 400 },
    );
  }
  const role: "admin" | "collaborator" =
    body.role === "admin" ? "admin" : "collaborator";

  const auth = getAdminAuth();
  try {
    const existing = await auth.getUserByEmail(email);
    if (existing) {
      // Already has an account. The agency-owner / sub-account-admin can
      // add them directly via the members route; this endpoint is just for
      // pre-account invites.
      return NextResponse.json(
        {
          error:
            "An account already exists for this email. Add them as a member instead.",
        },
        { status: 409 },
      );
    }
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "auth/user-not-found") throw err;
  }

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json(
      { error: "Sub-account not found" },
      { status: 404 },
    );
  }
  const sub = subSnap.data() ?? {};

  // Pre-assign territories: only meaningful for collaborators (admins see
  // every territory regardless). Validate each id against this sub-account's
  // territories subcollection and drop anything missing/archived so a stale
  // id can't slip onto the membership at signup. Cap at 30 to match the
  // Firestore `in` limit the rep's queries use.
  const assignedTerritoryIds =
    role === "collaborator"
      ? await validateTerritoryIds(db, subAccountId, body.assignedTerritoryIds)
      : [];

  // De-dupe: any pending invite for this (email, subAccountId) wins.
  const dupSnap = await db
    .collection("invites")
    .where("email", "==", email)
    .where("subAccountId", "==", subAccountId)
    .where("acceptedByUid", "==", null)
    .where("revokedAt", "==", null)
    .limit(1)
    .get();

  let inviteId: string;
  let reused = false;
  if (!dupSnap.empty) {
    inviteId = dupSnap.docs[0].id;
    reused = true;
    // Re-inviting doubles as "update": reflect the role + territories the
    // admin just picked so a corrected selection takes effect on accept.
    await dupSnap.docs[0].ref.update({
      subAccountRole: role,
      assignedTerritoryIds,
    });
  } else {
    const ref = await db.collection("invites").add({
      email,
      agencyId: sub.agencyId,
      subAccountId,
      subAccountRole: role,
      agencyRole: null,
      invitedByUid: access.uid,
      createdAt: FieldValue.serverTimestamp(),
      acceptedByUid: null,
      acceptedAt: null,
      revokedAt: null,
      assignedTerritoryIds,
    });
    inviteId = ref.id;
  }

  const inviteUrl = buildInviteUrl(email);

  // Send the delivery email. Failures here don't roll back the invite — the
  // admin can still copy the link from the UI and share it manually.
  let mailed = false;
  let mailError: string | null = null;
  if (emailIsConfigured()) {
    try {
      const inviterSnap = await db.doc(`users/${access.uid}`).get();
      const inviterData = inviterSnap.data() ?? {};
      const inviterName =
        (inviterData.displayName as string) ||
        (inviterData.email as string) ||
        "A teammate";
      const subAccountName = (sub.name as string) || "their workspace";
      const roleLabel = role === "admin" ? "Admin" : "Collaborator";

      await sendEmail({
        to: email,
        subject: `${inviterName} invited you to ${subAccountName} on LeadStack`,
        text: renderInviteText({
          inviterName,
          subAccountName,
          roleLabel,
          inviteUrl,
        }),
        html: renderInviteHtml({
          inviterName,
          subAccountName,
          roleLabel,
          inviteUrl,
        }),
      });
      mailed = true;
    } catch (err) {
      mailError = err instanceof Error ? err.message : String(err);
      console.warn(
        "[invite] sendEmail failed — invite still created",
        mailError,
      );
    }
  }

  // Public-API webhook event so subscribers (e.g. an HR / onboarding
  // Zapier flow) see new teammate invites in real time. Fire-and-forget;
  // dispatch failures don't unwind the invite. We emit on every call
  // including resends — `reused: true` lets subscribers distinguish.
  void emitWebhookEvent({
    subAccountId,
    agencyId: (sub.agencyId as string) ?? "",
    mode: "live",
    type: "member.invited",
    payload: {
      invite: {
        id: inviteId,
        object: "invite",
        email,
        role,
        invited_by_uid: access.uid,
        assigned_territory_ids: assignedTerritoryIds,
        reused,
        mailed,
        created_at: new Date().toISOString(),
      },
    },
  });

  return NextResponse.json({
    ok: true,
    inviteId,
    email,
    subAccountId,
    role,
    reused,
    mailed,
    mailError,
    inviteUrl,
  });
}

/**
 * Keep only the ids that resolve to an active territory in this
 * sub-account. Deduped + capped at 30 (the Firestore `in` limit the
 * collaborator's deal/contact queries rely on). Returns [] for any
 * non-array input.
 */
async function validateTerritoryIds(
  db: FirebaseFirestore.Firestore,
  subAccountId: string,
  raw: unknown,
): Promise<string[]> {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const wanted = [
    ...new Set(raw.filter((x): x is string => typeof x === "string" && !!x)),
  ].slice(0, 30);
  if (wanted.length === 0) return [];

  const refs = wanted.map((tid) =>
    db.doc(`subAccounts/${subAccountId}/territories/${tid}`),
  );
  const snaps = await db.getAll(...refs);
  return snaps
    .filter((s) => s.exists && s.data()?.status === "active")
    .map((s) => s.id);
}

function buildInviteUrl(email: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const path = `/signup?email=${encodeURIComponent(email)}`;
  return appUrl ? `${appUrl}${path}` : path;
}

interface InviteContext {
  inviterName: string;
  subAccountName: string;
  roleLabel: string;
  inviteUrl: string;
}

function renderInviteText({
  inviterName,
  subAccountName,
  roleLabel,
  inviteUrl,
}: InviteContext): string {
  return [
    `${inviterName} invited you to join ${subAccountName} on LeadStack as ${roleLabel}.`,
    "",
    `Accept the invite by creating your account here:`,
    inviteUrl,
    "",
    `If you weren't expecting this invite, you can safely ignore this email.`,
  ].join("\n");
}

function renderInviteHtml({
  inviterName,
  subAccountName,
  roleLabel,
  inviteUrl,
}: InviteContext): string {
  const inviter = escapeHtml(inviterName);
  const sub = escapeHtml(subAccountName);
  const role = escapeHtml(roleLabel);
  const url = escapeHtml(inviteUrl);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>You're invited to ${sub} on LeadStack</title>
</head>
<body style="margin:0; padding:0; background:#f6f6f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#0a0a0f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f9; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px; background:#ffffff; border-radius:16px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding-bottom:20px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle; padding-right:8px;">
                    <svg width="22" height="22" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="ls-mail-1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient>
                        <linearGradient id="ls-mail-2" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#a855f7"/></linearGradient>
                        <linearGradient id="ls-mail-3" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#c026d3"/><stop offset="100%" stop-color="#ec4899"/></linearGradient>
                      </defs>
                      <path d="M 56 8 L 18 8 L 8 16 L 18 24 L 56 24 Z" fill="url(#ls-mail-1)"/>
                      <path d="M 8 28 L 46 28 L 56 36 L 46 44 L 8 44 Z" fill="url(#ls-mail-2)"/>
                      <path d="M 56 48 L 18 48 L 8 56 L 18 60 L 56 60 Z" fill="url(#ls-mail-3)"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:18px; font-weight:700; color:#0a0a0f; letter-spacing:-0.01em;">LeadStack</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              <h1 style="margin:0 0 12px 0; font-size:22px; font-weight:600; color:#0a0a0f; letter-spacing:-0.01em;">You're invited</h1>
              <p style="margin:0 0 8px 0; font-size:15px; line-height:1.5; color:#4a4a55;">${inviter} invited you to <strong style="color:#0a0a0f;">${sub}</strong> on LeadStack.</p>
              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.5; color:#4a4a55;">You'll join as <strong>${role}</strong>.</p>
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <a href="${url}" style="display:inline-block; background:#7c3aed; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600;">Accept invite</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0; font-size:13px; line-height:1.5; color:#8a8a95;">Or paste this link into your browser:<br/><a href="${url}" style="color:#7c3aed; word-break:break-all;">${url}</a></p>
              <p style="margin:24px 0 0 0; font-size:12px; line-height:1.5; color:#8a8a95;">If you weren't expecting this invite, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

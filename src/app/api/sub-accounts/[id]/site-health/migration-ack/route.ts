import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  MIGRATION_ACK_IDS,
  type MigrationAckId,
} from "@/lib/site-health/migration-independence";

/**
 * POST /api/sub-accounts/[id]/site-health/migration-ack
 *
 * Records that the agent confirmed one of the migration steps no code here
 * can observe — conversation history exported, backup taken, website checked.
 *
 * Stored with the uid and timestamp deliberately. These items gate a decision
 * to cancel a paid account, and if one turns out to be wrong there needs to
 * be a record of who said it and when, rather than an anonymous boolean.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const access = await requireSubAccountAdmin(request, id);
  if (access instanceof NextResponse) return access;

  const body = (await request.json().catch(() => null)) as {
    ack?: unknown;
    confirmed?: unknown;
  } | null;
  const ackId = MIGRATION_ACK_IDS.includes(body?.ack as MigrationAckId)
    ? (body!.ack as MigrationAckId)
    : null;
  if (!ackId) {
    return NextResponse.json(
      { error: "Unknown confirmation." },
      { status: 400 }
    );
  }

  // Withdrawing a confirmation has to be possible: an agent who ticked the
  // wrong row must be able to take it back before they cancel anything.
  const value =
    body?.confirmed === false
      ? FieldValue.delete()
      : {
          acknowledgedByUid: access.uid,
          acknowledgedAt: new Date().toISOString(),
        };

  await getAdminDb()
    .doc(`subAccounts/${id}`)
    .set(
      {
        migrationAcks: { [ackId]: value },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  return NextResponse.json({ ok: true, ack: ackId });
}

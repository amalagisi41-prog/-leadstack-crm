import "server-only";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";

/**
 * !!! DESTRUCTIVE — DEVELOPER USE ONLY !!!
 *
 * Recursively deletes every Firestore collection AND every Firebase Auth
 * user in the project. There is no undo. Restoring data requires a backup.
 *
 * Provided so a freshly-cloned dev environment can be reset to a clean
 * greenfield state during the multi-tenancy migration. Do not call this
 * against any project that holds real data.
 *
 * Guards (all must pass):
 *   1. process.env.NODE_ENV !== "production"  -> returns 403 if it is
 *   2. ?confirm=NUKE in the query string      -> returns 400 if missing
 *   3. Lives under /api/dev-only/...          -> the path itself is a
 *      forewarning to anyone reviewing the routes table
 *
 * If you don't recognise this route, you almost certainly do not want to
 * call it. Delete this file once the local migration is done.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Disabled in production." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "NUKE") {
    return NextResponse.json(
      {
        error:
          "Pass ?confirm=NUKE to confirm. This deletes EVERY Firestore document and EVERY Firebase Auth user in this project. There is no undo.",
      },
      { status: 400 },
    );
  }

  const db = getAdminDb();
  const auth = getAdminAuth();

  // 1) Recursively delete every top-level collection. This walks
  //    subcollections automatically.
  const collections = await db.listCollections();
  const deletedCollections: string[] = [];
  for (const c of collections) {
    await db.recursiveDelete(c);
    deletedCollections.push(c.id);
  }

  // 2) Delete every Firebase Auth user. The Admin SDK pages results in
  //    batches of 1000.
  let authUsersDeleted = 0;
  let nextPageToken: string | undefined;
  do {
    const list = await auth.listUsers(1000, nextPageToken);
    if (list.users.length > 0) {
      const uids = list.users.map((u) => u.uid);
      const result = await auth.deleteUsers(uids);
      authUsersDeleted += result.successCount;
    }
    nextPageToken = list.pageToken;
  } while (nextPageToken);

  return NextResponse.json({
    ok: true,
    deletedCollections,
    authUsersDeleted,
    message:
      "Firestore + Auth wiped. Sign up again from /signup as the bootstrap admin.",
  });
}

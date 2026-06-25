import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { setTaskCompletedServerSide } from "@/lib/server/tasks-service";

/**
 * Toggle a task's completed flag server-side so `task.completed` fires (on
 * the false→true edge) and the contact's task_completed activity is written.
 * Body: { completed: boolean }.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const db = getAdminDb();
  const snap = await db.doc(`tasks/${id}`).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  const data = snap.data()!;

  const access = await requireSubAccountMember(request, data.subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.completed !== "boolean") {
    return NextResponse.json(
      { error: "`completed` must be a boolean" },
      { status: 400 },
    );
  }

  const result = await setTaskCompletedServerSide({
    taskId: id,
    completed: body.completed,
    userId: access.uid,
    mode: (data.mode as "live" | "test") ?? "live",
  });
  if (!result) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ task: result.task });
}

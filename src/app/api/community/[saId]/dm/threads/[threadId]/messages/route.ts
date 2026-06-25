import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import {
  hasBlocked,
  listMessagesServerSide,
} from "@/lib/server/community-dm-service";

export const dynamic = "force-dynamic";

/** Member: poll a thread's messages (optionally only those after `since`). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ saId: string; threadId: string }> },
) {
  const { saId, threadId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  const sinceParam = new URL(request.url).searchParams.get("since");
  const sinceMs = sinceParam ? Number(sinceParam) : undefined;

  const messages = await listMessagesServerSide({
    subAccountId: saId,
    threadId,
    viewerId: access.member.id,
    sinceMs: Number.isFinite(sinceMs) ? sinceMs : undefined,
  });
  if (messages === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // On the initial load (no `since`), also report whether the viewer has
  // blocked the other member so the modal can render the right composer state
  // without a second request. Skipped on the frequent polls to keep them cheap.
  let blockedByMe: boolean | undefined;
  if (!sinceParam) {
    const otherId = threadId
      .split("__")
      .find((x) => x !== access.member.id);
    if (otherId) blockedByMe = await hasBlocked(saId, access.member.id, otherId);
  }

  return NextResponse.json({ messages, blockedByMe });
}

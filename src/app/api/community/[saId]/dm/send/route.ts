import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { sendMessageServerSide } from "@/lib/server/community-dm-service";

export const dynamic = "force-dynamic";

/** Member: send a DM to another member (creates the thread on first send). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: { otherId?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.otherId || !body.body?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const result = await sendMessageServerSide({
      subAccountId: saId,
      senderId: access.member.id,
      otherId: body.otherId,
      body: body.body,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't send" },
      { status: 400 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { enrollForTest } from "@/lib/workflows/engine";

export const dynamic = "force-dynamic";

/** POST — manually enroll a contact to dry-run this workflow. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; workflowId: string }> },
): Promise<NextResponse> {
  const { id: subAccountId, workflowId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: { contactId?: string };
  try {
    body = (await request.json()) as { contactId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.contactId) {
    return NextResponse.json({ error: "Missing contactId" }, { status: 400 });
  }

  const result = await enrollForTest({
    subAccountId,
    workflowId,
    contactId: body.contactId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

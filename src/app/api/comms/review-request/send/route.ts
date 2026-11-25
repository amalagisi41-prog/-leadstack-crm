import { NextResponse } from "next/server";
import { requireContactAccessible, requireUid } from "@/lib/comms/route-auth";
import { maybeSendReviewRequest } from "@/lib/reviews/log";
import { reviewReasonText } from "@/lib/reviews/reasons";

type Body = { contactId?: string };

/**
 * Manual "Request review" send from the contact profile. Auth-gated; delegates
 * to the shared dispatcher with `trigger: "manual"` (which bypasses the
 * cooldown but still stamps it). Returns the dispatcher's outcome so the UI can
 * toast a precise message (sent / not configured / opted out / …).
 */
export async function POST(request: Request) {
  const auth = requireUid(request);
  if (auth instanceof NextResponse) return auth;

  let payload: Body;
  try {
    payload = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contactId = payload.contactId?.trim();
  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const contact = await requireContactAccessible(auth.uid, contactId);
  if (contact instanceof NextResponse) return contact;

  const result = await maybeSendReviewRequest({
    subAccountId: contact.subAccountId,
    agencyId: contact.agencyId,
    contactId,
    trigger: "manual",
  });

  // Never pretend: a send that didn't happen is an error the person sees,
  // with the exact reason (it is also on the Review Requests log).
  if (!result.sent) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        reason: result.reason,
        error: `Not sent — ${reviewReasonText(result.reason, result.detail)}.`,
      },
      { status: 422 },
    );
  }
  return NextResponse.json({ ok: true, sent: true, requestId: result.requestId });
}

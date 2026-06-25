import "server-only";

import { NextResponse } from "next/server";
import { metaAppConfigured } from "@/lib/comms/meta";
import { emailIsConfigured } from "@/lib/comms/resend";
import { smsIsConfigured } from "@/lib/comms/twilio";

/**
 * Reports which OPTIONAL deployment-level integrations have their env vars
 * configured, so client UIs can disable controls that can't work yet (rather
 * than letting an agency owner enable a feature that has no backing creds).
 *
 * Returns only non-sensitive booleans — no secrets, no tenant data. Gated by
 * the middleware (this path isn't public, so only authenticated users reach
 * it); we additionally require the forwarded uid header.
 */
export async function GET(request: Request) {
  if (!request.headers.get("x-user-uid")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    // META_APP_ID + META_APP_SECRET present — required for the FB/IG inbox AND
    // the Social Planner (both ride one Meta connection).
    metaConfigured: metaAppConfigured(),
    // RESEND_API_KEY + EMAIL_FROM present — required by the workflow Send email
    // + Internal notification steps. Lets the builder flag steps that can't run.
    emailConfigured: emailIsConfigured(),
    // Shared-mode Twilio env present. A sub-account can ALSO send via its own
    // dedicated Twilio (checked client-side from twilioConfig), so the builder
    // ORs this with the per-sub-account config.
    smsConfigured: smsIsConfigured(),
  });
}

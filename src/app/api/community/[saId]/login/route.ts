import { NextResponse } from "next/server";
import { getCommunityGate } from "@/lib/community/gate";
import { signMemberMagicLinkToken } from "@/lib/community/member-auth";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";

export const dynamic = "force-dynamic";

/**
 * Request a passwordless sign-in link for a community member. Anonymous POST.
 *
 * Unlike the affiliate login, this is a sign-IN-or-UP flow: the member doc is
 * created at verify time (see ./verify), so any valid email gets a link when
 * the sub-account's community is enabled. Creating an identity is harmless — a
 * member sees no group content until they join one. Rate-limiting (added with
 * the public surface) keeps the endpoint from being a mail amplifier.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;

  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { email?: string; join?: string };
  try {
    body = (await request.json()) as { email?: string; join?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }
  const joinGroupId =
    typeof body.join === "string" && body.join.trim() ? body.join.trim() : undefined;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    if (emailIsConfigured()) {
      const token = signMemberMagicLinkToken(saId, email, joinGroupId);
      const link = `${appUrl}/api/community/${saId}/login/verify?token=${encodeURIComponent(token)}`;

      await sendEmail({
        to: email,
        subject: "Your sign-in link",
        text: `Hi,

Click the link below to sign in. The link expires in 15 minutes and can
only be used once.

${link}

If you didn't request this, you can safely ignore it.
`,
        html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;line-height:1.6;">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">Sign in</h1>
  <p style="margin:0 0 24px;color:#3a3a44;">Click the button below to sign in. The link expires in 15 minutes.</p>
  <p style="margin:0 0 24px;">
    <a href="${link}" style="display:inline-block;background:#202124;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;">Sign in</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#909090;">If you didn't request this, you can safely ignore it.</p>
</body></html>`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[community/login] Send failed: ${message}`);
  }

  return NextResponse.json({
    ok: true,
    message: "If that email is valid, we've sent a sign-in link.",
  });
}

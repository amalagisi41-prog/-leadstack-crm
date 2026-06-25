import { NextResponse } from "next/server";
import { clearMemberSessionCookie } from "@/lib/community/member-session";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> },
) {
  const { saId } = await params;
  await clearMemberSessionCookie();
  return NextResponse.redirect(new URL(`/c/${saId}/login`, request.url));
}

import { NextResponse } from "next/server";
import { exchangeAuthorizationCode, readClient } from "@/lib/mcp/oauth";
import { recordMcpConnection } from "@/lib/mcp/connection";

export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  const code = String(form.get("code") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeVerifier = String(form.get("code_verifier") ?? "");
  if (grantType !== "authorization_code" || !code || !clientId || !redirectUri || !codeVerifier) {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  }
  const exchanged = await exchangeAuthorizationCode({ code, clientId, redirectUri, codeVerifier });
  if (!exchanged) return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
  const client = await readClient(clientId).catch(() => null);
  await recordMcpConnection(exchanged.uid, client?.client_name ?? null).catch((err) => {
    console.error("[mcp/token] could not record connection", err);
  });
  return NextResponse.json({ token_type: "Bearer", access_token: exchanged.accessToken, expires_in: exchanged.expiresIn });
}

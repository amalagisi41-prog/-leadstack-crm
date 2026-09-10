import { NextResponse } from "next/server";
import { createAuthorizationCode, readClient, readRequestCaller } from "@/lib/mcp/oauth";

function bad(message: string) {
  return new NextResponse(message, { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") ?? "";
  const redirectUri = url.searchParams.get("redirect_uri") ?? "";
  const codeChallenge = url.searchParams.get("code_challenge") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const client = readClient(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri) || !codeChallenge) return bad("Invalid OAuth authorization request.");
  const caller = await readRequestCaller(request);
  if (!caller) return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`, url));
  const html = `<!doctype html><html><body style="font-family:system-ui;max-width:520px;margin:15vh auto;padding:24px"><h1>Connect AgentStack</h1><p>${client.client_name ?? "The requesting MCP client"} wants to access your authorized AgentStack workspace.</p><form method="post"><input type="hidden" name="client_id" value="${clientId}"><input type="hidden" name="redirect_uri" value="${redirectUri}"><input type="hidden" name="code_challenge" value="${codeChallenge}"><input type="hidden" name="state" value="${state}"><button type="submit">Approve connection</button></form></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const state = String(form.get("state") ?? "");
  const client = readClient(clientId);
  const caller = await readRequestCaller(request);
  if (!client || !client.redirect_uris.includes(redirectUri) || !caller || !codeChallenge) return bad("Invalid OAuth authorization request.");
  const code = await createAuthorizationCode({ clientId, redirectUri, codeChallenge, uid: caller.uid, email: caller.email });
  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect);
}

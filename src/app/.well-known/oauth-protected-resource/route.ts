import { NextResponse } from "next/server";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["agentstack:read", "agentstack:campaigns"],
  });
}

import { NextResponse } from "next/server";
import { readRequestCaller } from "@/lib/mcp/oauth";
import { readMcpConnection } from "@/lib/mcp/connection";

/**
 * The signed-in operator asks "did my AI app actually connect?". Answers from
 * the record the token endpoint writes when an OAuth handshake completes —
 * never from anything the browser claims.
 */
export async function GET(request: Request) {
  const caller = await readRequestCaller(request);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const record = await readMcpConnection(caller.uid);
  return NextResponse.json({
    connected: record !== null,
    clientName: record?.clientName ?? null,
    connectedAt: record ? new Date(record.connectedAt).toISOString() : null,
    lastUsedAt: record?.lastUsedAt ? new Date(record.lastUsedAt).toISOString() : null,
  });
}

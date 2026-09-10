import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { buildContentBrief } from "@/lib/marketing/content-brief";
import { findCampaignListing } from "@/lib/marketing/campaign-listing";
import { readAccessToken } from "@/lib/mcp/oauth";
import type { SubAccountDoc } from "@/types";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const TOOLS = [
  {
    name: "agentstack_get_workspace_status",
    description: "Read the current AgentStack workspace connection and listing-sync status.",
    inputSchema: { type: "object", properties: { subAccountId: { type: "string", description: "AgentStack sub-account id." } }, required: ["subAccountId"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "agentstack_find_featured_listing",
    description: "Refresh and find one property from the connected IDX Broker featured/agent-listings feed. Does not scrape public websites.",
    inputSchema: { type: "object", properties: { subAccountId: { type: "string" }, listingNumber: { type: "string", description: "IDX Broker listing number." } }, required: ["subAccountId", "listingNumber"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: "agentstack_build_property_campaign",
    description: "Build reviewable, facts-only drafts for landing page, Facebook, Instagram, email, SMS, and Google Business from one authorized featured listing. It creates drafts only; it does not publish or send.",
    inputSchema: { type: "object", properties: { subAccountId: { type: "string" }, listingNumber: { type: "string" } }, required: ["subAccountId", "listingNumber"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
] as const;

function resultContent(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value };
}

function response(id: JsonRpcRequest["id"], result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function errorResponse(id: JsonRpcRequest["id"], code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

async function executeTool(request: Request, name: string, args: Record<string, unknown>) {
  const subAccountId = typeof args.subAccountId === "string" ? args.subAccountId.trim() : "";
  if (!subAccountId) throw new Error("subAccountId is required.");
  const db = getAdminDb();

  if (name === "agentstack_get_workspace_status") {
    const access = await requireSubAccountMember(request, subAccountId);
    if (access instanceof NextResponse) throw new Error((await access.json()).error ?? "Access denied.");
    const snap = await db.doc(`subAccounts/${subAccountId}`).get();
    const sub = snap.data() as SubAccountDoc;
    return resultContent({
      subAccountId,
      name: sub.name,
      idxEnabled: sub.idxEnabledByAgency === true && sub.idxConfig?.enabled === true,
      idxConnected: sub.idxConfig?.connected === true,
      listingCount: sub.idxConfig?.listingCount ?? 0,
      lastSyncStatus: sub.idxConfig?.lastSyncStatus ?? "idle",
    });
  }

  const listingNumber = typeof args.listingNumber === "string" ? args.listingNumber.trim() : "";
  if (!listingNumber) throw new Error("listingNumber is required.");
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) throw new Error((await access.json()).error ?? "Access denied.");
  const listing = await findCampaignListing(db, subAccountId, listingNumber);
  if (!listing) throw new Error("No matching featured listing was returned by the connected IDX Broker account. Confirm the property is one of the account's featured/agent listings.");
  if (name === "agentstack_find_featured_listing") return resultContent({ listing });

  const admin = await requireSubAccountAdmin(request, subAccountId);
  if (admin instanceof NextResponse) throw new Error((await admin.json()).error ?? "Sub-account admin only.");
  return resultContent({ listingId: listing.id, brief: buildContentBrief(listing) });
}

export async function POST(request: Request) {
  const resourceMetadata = `${new URL(request.url).origin}/.well-known/oauth-protected-resource`;
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const tokenCaller = bearer ? readAccessToken(bearer) : null;
  if (bearer && !tokenCaller) {
    return NextResponse.json({ error: "Invalid access token" }, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"` } });
  }
  const authenticatedRequest = tokenCaller
    ? new Request(request, { headers: new Headers({ ...Object.fromEntries(request.headers), "x-user-uid": tokenCaller.uid, "x-user-email": tokenCaller.email }) })
    : request;
  if (!authenticatedRequest.headers.get("x-user-uid")) return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"` } });
  let body: JsonRpcRequest;
  try { body = (await request.json()) as JsonRpcRequest; } catch { return errorResponse(null, -32700, "Parse error"); }
  const id = body.id;
  if (body.method === "notifications/initialized") return new NextResponse(null, { status: 204 });
  if (body.method === "initialize") return response(id, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "agentstack", version: "1.0.0" } });
  if (body.method === "tools/list") return response(id, { tools: TOOLS });
  if (body.method !== "tools/call") return errorResponse(id, -32601, "Method not found");

  const params = body.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  const args = params.arguments && typeof params.arguments === "object" ? params.arguments as Record<string, unknown> : {};
  if (!TOOLS.some((tool) => tool.name === name)) return errorResponse(id, -32602, "Unknown tool");
  try {
    return response(id, await executeTool(authenticatedRequest, name, args));
  } catch (error) {
    return response(id, { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Tool failed." }] });
  }
}

/**
 * Streamable HTTP requires the MCP endpoint to accept GET as well as POST.
 * AgentStack is stateless, so authenticated GETs expose a short-lived SSE
 * heartbeat rather than holding a server-to-client notification channel.
 * An unauthenticated browser visit gets a useful health response instead of
 * an opaque 405 page.
 */
export function GET(request: Request) {
  const resourceMetadata = `${new URL(request.url).origin}/.well-known/oauth-protected-resource`;
  if (!request.headers.get("authorization")) {
    return NextResponse.json({
      name: "agentstack",
      transport: "MCP Streamable HTTP",
      endpoint: new URL(request.url).origin + "/api/mcp",
      authentication: resourceMetadata,
      message: "Send MCP JSON-RPC requests with POST after completing OAuth.",
    });
  }
  return new NextResponse(": AgentStack MCP stream ready\n\n", {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

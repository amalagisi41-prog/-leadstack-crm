import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";

const auth = { "x-user-uid": "operator-1" };

describe("MCP endpoint", () => {
  it("initializes an authenticated MCP session", async () => {
    const res = await POST(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ result: { serverInfo: { name: "agentstack" }, capabilities: { tools: {} } } });
  });

  it("lists only the guarded AS tools", async () => {
    const res = await POST(new Request("http://localhost/api/mcp", {
      method: "POST", headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    }));
    const body = await res.json() as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name)).toEqual([
      "agentstack_get_workspace_status",
      "agentstack_find_featured_listing",
      "agentstack_build_property_campaign",
    ]);
  });
});

import { NextResponse } from "next/server";
import { registerClient } from "@/lib/mcp/oauth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { redirect_uris?: unknown; client_name?: unknown };
    if (!Array.isArray(body.redirect_uris) || body.redirect_uris.some((uri) => typeof uri !== "string")) {
      return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
    }
    return NextResponse.json(registerClient({
      redirectUris: body.redirect_uris,
      clientName: typeof body.client_name === "string" ? body.client_name : undefined,
    }), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Registration failed." }, { status: 400 });
  }
}

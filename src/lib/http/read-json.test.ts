import { describe, expect, it } from "vitest";
import { readJson, transportMessage } from "./read-json";

/**
 * The failure this prevents, seen in the wild: an operator pastes their Zillow
 * profile into the Business Blueprint and the toast reads
 *
 *   Failed to execute 'json' on 'Response': Unexpected end of JSON input
 *
 * — a sentence about our infrastructure, shown to someone who asked about
 * their website, with nothing in it they can do.
 *
 * An empty body is routine: a serverless function killed at its duration
 * limit writes nothing, and so does an unhandled throw inside a route
 * handler. Both arrive as a resolved fetch whose body will not parse.
 */

describe("reading a response that may not be JSON", () => {
  it("parses an ordinary JSON body", async () => {
    const data = await readJson<{ profile: { name: string } }>(
      new Response(JSON.stringify({ profile: { name: "Jane" } }), {
        status: 200,
      })
    );
    expect(data.profile?.name).toBe("Jane");
    expect(data.error).toBeUndefined();
  });

  it("keeps the server's own error message", async () => {
    const data = await readJson(
      new Response(JSON.stringify({ error: "Zillow blocks automated reading." }), {
        status: 502,
      })
    );
    expect(data.error).toBe("Zillow blocks automated reading.");
  });

  it("does not throw on an empty body", async () => {
    // The exact shape of the reported bug: the gateway killed the function.
    const data = await readJson(new Response("", { status: 500 }));
    expect(data.error).toMatch(/sent nothing back/i);
    expect(data.error).toMatch(/try again/i);
  });

  it("does not throw on an HTML error page from a proxy", async () => {
    const data = await readJson(
      new Response("<html><body>504 Gateway Timeout</body></html>", {
        status: 504,
        headers: { "content-type": "text/html" },
      })
    );
    expect(data.error).toMatch(/took too long/i);
  });

  it("does not hand back a bare null for callers to destructure", async () => {
    const data = await readJson(new Response("null", { status: 200 }));
    expect(data).toBeTypeOf("object");
    expect(data.error).toBeTruthy();
  });

  it("says the session expired rather than showing a status code", async () => {
    expect(transportMessage(new Response("", { status: 401 }))).toMatch(
      /session has expired/i
    );
  });

  it("never surfaces a DOM exception's wording", async () => {
    for (const status of [408, 413, 500, 502, 504, 200]) {
      const data = await readJson(new Response("", { status }));
      expect(data.error, String(status)).not.toMatch(/failed to execute|json input/i);
      expect(data.error!.length, String(status)).toBeGreaterThan(30);
    }
  });
});

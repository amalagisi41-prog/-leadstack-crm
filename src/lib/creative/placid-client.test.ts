import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.PLACID_API_TOKEN = "test-token";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("placidIsConfigured", () => {
  it("reflects whether PLACID_API_TOKEN is set", async () => {
    const { placidIsConfigured } = await import("./placid-client");
    expect(placidIsConfigured()).toBe(true);
    delete process.env.PLACID_API_TOKEN;
    vi.resetModules();
    const reloaded = await import("./placid-client");
    expect(reloaded.placidIsConfigured()).toBe(false);
  });
});

describe("renderImage", () => {
  it("defaults to a free watermarked preview (test: true) unless told otherwise", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "img_1", status: "finished", image_url: "https://cdn.test/i.png" }), {
        status: 200,
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const { renderImage } = await import("./placid-client");
    await renderImage({ templateId: "tpl_1", layers: { photo: { image: "https://example.test/p.jpg" } } });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.test).toBe(true);
  });

  it("sends test: false when the caller asks for the final render", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "img_1", status: "finished", image_url: "https://cdn.test/i.png" }), {
        status: 200,
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const { renderImage } = await import("./placid-client");
    await renderImage({
      templateId: "tpl_1",
      layers: { photo: { image: "https://example.test/p.jpg" } },
      test: false,
    });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.test).toBe(false);
  });

  it("returns a 'finished' result with the image url on success", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "img_1", status: "finished", image_url: "https://cdn.test/i.png" }), {
        status: 200,
      })
    ) as unknown as typeof fetch;
    const { renderImage } = await import("./placid-client");
    const result = await renderImage({ templateId: "tpl_1", layers: {} });
    expect(result.status).toBe("finished");
    expect(result.imageUrl).toBe("https://cdn.test/i.png");
  });

  it("returns a 'queued' result when Placid hasn't finished rendering yet", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "img_1", status: "queued" }), { status: 200 })
    ) as unknown as typeof fetch;
    const { renderImage } = await import("./placid-client");
    const result = await renderImage({ templateId: "tpl_1", layers: {} });
    expect(result.status).toBe("queued");
    expect(result.imageUrl).toBeNull();
  });

  it("throws a PlacidError naming the status on a non-2xx response", async () => {
    global.fetch = vi.fn(async () => new Response("bad template", { status: 400 })) as unknown as typeof fetch;
    const { renderImage, PlacidError } = await import("./placid-client");
    await expect(renderImage({ templateId: "tpl_1", layers: {} })).rejects.toThrow(PlacidError);
  });

  it("refuses to call out when not configured", async () => {
    delete process.env.PLACID_API_TOKEN;
    vi.resetModules();
    const { renderImage, PlacidError } = await import("./placid-client");
    await expect(renderImage({ templateId: "tpl_1", layers: {} })).rejects.toThrow(PlacidError);
  });
});

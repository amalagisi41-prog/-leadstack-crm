import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSharedJsonCache, fetchJsonShared } from "./shared-json";

afterEach(() => {
  vi.unstubAllGlobals();
  clearSharedJsonCache();
});

describe("fetchJsonShared", () => {
  it("collapses concurrent reads of one URL into a single request", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ v: 1 }) }));
    vi.stubGlobal("fetch", fetchMock);
    const [a, b, c] = await Promise.all([
      fetchJsonShared("/api/x"),
      fetchJsonShared("/api/x"),
      fetchJsonShared("/api/x"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual([{ v: 1 }, { v: 1 }, { v: 1 }]);
  });

  it("never caches a failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ v: 2 }) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchJsonShared("/api/y")).toBeNull();
    expect(await fetchJsonShared("/api/y")).toEqual({ v: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

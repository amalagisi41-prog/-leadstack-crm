import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.CREATIFY_API_ID = "test-id";
  process.env.CREATIFY_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe("creatifyIsConfigured", () => {
  it("is false unless both the id and key are set", async () => {
    const { creatifyIsConfigured } = await import("./creatify-client");
    expect(creatifyIsConfigured()).toBe(true);
    delete process.env.CREATIFY_API_KEY;
    vi.resetModules();
    const reloaded = await import("./creatify-client");
    expect(reloaded.creatifyIsConfigured()).toBe(false);
  });
});

describe("createImageToVideoJob", () => {
  it("refuses to call out when not configured", async () => {
    delete process.env.CREATIFY_API_ID;
    vi.resetModules();
    const { createImageToVideoJob, CreatifyError } = await import("./creatify-client");
    await expect(
      createImageToVideoJob({ imageUrl: "https://example.test/a.jpg", script: "hi" })
    ).rejects.toThrow(CreatifyError);
  });

  it("returns the job id from a successful response", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "job_123" }), { status: 200 })
    ) as unknown as typeof fetch;
    const { createImageToVideoJob } = await import("./creatify-client");
    const result = await createImageToVideoJob({
      imageUrl: "https://example.test/a.jpg",
      script: "A lovely home.",
    });
    expect(result.jobId).toBe("job_123");
  });

  it("throws a CreatifyError naming the status on a non-2xx response", async () => {
    global.fetch = vi.fn(async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    const { createImageToVideoJob, CreatifyError } = await import("./creatify-client");
    await expect(
      createImageToVideoJob({ imageUrl: "https://example.test/a.jpg", script: "hi" })
    ).rejects.toThrow(CreatifyError);
  });
});

describe("getVideoJobStatus", () => {
  it("maps a finished job to 'done' with its video url", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: "done", video_output: "https://cdn.test/v.mp4" }), { status: 200 })
    ) as unknown as typeof fetch;
    const { getVideoJobStatus } = await import("./creatify-client");
    const result = await getVideoJobStatus("job_123");
    expect(result.status).toBe("done");
    expect(result.videoUrl).toBe("https://cdn.test/v.mp4");
  });

  it("maps an unrecognized status to 'processing' rather than throwing", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ status: "in_progress" }), { status: 200 })
    ) as unknown as typeof fetch;
    const { getVideoJobStatus } = await import("./creatify-client");
    const result = await getVideoJobStatus("job_123");
    expect(result.status).toBe("processing");
  });
});

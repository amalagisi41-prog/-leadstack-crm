import { describe, expect, it } from "vitest";
import { uniqueFileName, zipFileName } from "./media-zip";

describe("uniqueFileName", () => {
  it("returns the name unchanged when there are no collisions", () => {
    const used = new Set<string>();
    expect(uniqueFileName("photo.jpg", used)).toBe("photo.jpg");
    expect(used.has("photo.jpg")).toBe(true);
  });

  it("appends a counter when the name collides", () => {
    const used = new Set<string>();
    expect(uniqueFileName("photo.jpg", used)).toBe("photo.jpg");
    expect(uniqueFileName("photo.jpg", used)).toBe("photo-1.jpg");
    expect(uniqueFileName("photo.jpg", used)).toBe("photo-2.jpg");
  });

  it("handles files without extensions", () => {
    const used = new Set<string>();
    expect(uniqueFileName("readme", used)).toBe("readme");
    expect(uniqueFileName("readme", used)).toBe("readme-1");
  });

  it("strips path separators to prevent ZIP directory traversal", () => {
    const used = new Set<string>();
    expect(uniqueFileName("some/path/photo.jpg", used)).toBe(
      "some-path-photo.jpg",
    );
    expect(uniqueFileName("other\\back\\slash.png", used)).toBe(
      "other-back-slash.png",
    );
  });

  it("handles multiple dots in filename correctly", () => {
    const used = new Set<string>();
    expect(uniqueFileName("file.backup.tar.gz", used)).toBe(
      "file.backup.tar.gz",
    );
    expect(uniqueFileName("file.backup.tar.gz", used)).toBe(
      "file.backup.tar-1.gz",
    );
  });
});

describe("zipFileName", () => {
  it("sanitizes special characters from the property id", () => {
    const result = zipFileName("10 Main St, Stamford CT");
    expect(result).toMatch(/^[a-zA-Z0-9._-]+-media\.zip$/);
    expect(result).toContain("10");
    expect(result).toContain("Main");
    expect(result).toContain("Stamford");
  });

  it("truncates long property ids to 80 characters", () => {
    const long = "a".repeat(200);
    const result = zipFileName(long);
    // 80 chars of property + "-media.zip"
    expect(result).toBe(`${"a".repeat(80)}-media.zip`);
  });

  it("handles a clean property id unchanged", () => {
    expect(zipFileName("MLS-24205988")).toBe("MLS-24205988-media.zip");
  });
});

import { describe, expect, it } from "vitest";
import {
  isPhotoCategory,
  orderPhotos,
  sanitizePhotoCategories,
  type PhotoCategoryMap,
} from "./photo-categories";

/**
 * The ordering rule this guards: a listing nobody has categorized must render
 * byte-identically to how it rendered before categories existed. Every public
 * surface (brochure hero, IDX OpenGraph image, card thumbnail) reads
 * `photos[0]`, so a reshuffle here silently changes what a buyer sees first on
 * listings the agent never touched.
 */

const A = "https://cdn.test/a.jpg";
const B = "https://cdn.test/b.jpg";
const C = "https://cdn.test/c.jpg";
const D = "https://cdn.test/d.jpg";

describe("orderPhotos", () => {
  it("leaves an uncategorized listing in its original order", () => {
    expect(orderPhotos([C, A, B])).toEqual([C, A, B]);
    expect(orderPhotos([C, A, B], {})).toEqual([C, A, B]);
    expect(orderPhotos([C, A, B], null)).toEqual([C, A, B]);
  });

  it("puts the front exterior first and fills the brochure slots in order", () => {
    const categories: PhotoCategoryMap = {
      [A]: "kitchen",
      [B]: "exterior-front",
      [C]: "primary-bedroom",
      [D]: "living",
    };
    // Brochure reads [0] as hero and slice(1, 4) as the secondary row.
    expect(orderPhotos([A, B, C, D], categories)).toEqual([B, A, D, C]);
  });

  it("promotes only the tagged photo and leaves the rest as they were", () => {
    const categories: PhotoCategoryMap = { [C]: "exterior-front" };
    expect(orderPhotos([A, B, C, D], categories)).toEqual([C, A, B, D]);
  });

  it("keeps relative order within the same category", () => {
    const categories: PhotoCategoryMap = { [B]: "bedroom", [A]: "bedroom" };
    expect(orderPhotos([A, B], categories)).toEqual([A, B]);
  });

  it("ignores categories for photos that are not on the listing", () => {
    const categories: PhotoCategoryMap = { [D]: "exterior-front" };
    expect(orderPhotos([A, B], categories)).toEqual([A, B]);
  });

  it("treats an unrecognized category value as uncategorized", () => {
    const categories = { [A]: "penthouse-jacuzzi" } as unknown as PhotoCategoryMap;
    expect(orderPhotos([A, B], categories)).toEqual([A, B]);
  });

  it("does not mutate the input array", () => {
    const photos = [A, B];
    orderPhotos(photos, { [B]: "exterior-front" });
    expect(photos).toEqual([A, B]);
  });
});

describe("sanitizePhotoCategories", () => {
  it("drops URLs that are not on the listing", () => {
    expect(
      sanitizePhotoCategories({ [A]: "kitchen", [D]: "kitchen" }, [A, B])
    ).toEqual({ [A]: "kitchen" });
  });

  it("drops values that are not real categories", () => {
    expect(
      sanitizePhotoCategories({ [A]: "kitchen", [B]: "garage-ish" }, [A, B])
    ).toEqual({ [A]: "kitchen" });
  });

  it("returns an empty map for non-object input", () => {
    expect(sanitizePhotoCategories(null, [A])).toEqual({});
    expect(sanitizePhotoCategories("kitchen", [A])).toEqual({});
    expect(sanitizePhotoCategories([A], [A])).toEqual({});
  });
});

describe("isPhotoCategory", () => {
  it("accepts known categories and rejects everything else", () => {
    expect(isPhotoCategory("exterior-front")).toBe(true);
    expect(isPhotoCategory("floorplan")).toBe(true);
    expect(isPhotoCategory("kitchenette")).toBe(false);
    expect(isPhotoCategory(undefined)).toBe(false);
    expect(isPhotoCategory(3)).toBe(false);
  });
});

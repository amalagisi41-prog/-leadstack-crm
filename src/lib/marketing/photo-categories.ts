/**
 * Listing photo categories.
 *
 * Photos arrive as a flat `string[]` in whatever order the MLS export or the
 * agent's upload happened to produce. Every surface that shows a property then
 * treats `photos[0]` as the hero — the brochure header, the IDX page's
 * OpenGraph image, the property card thumbnail — and the brochure fills its
 * three secondary slots with `slice(1, 4)`. So today a bathroom can headline a
 * $1.2M listing purely because it was the first file selected.
 *
 * Rather than restructure `photos` (consumed in ~15 places including public
 * IDX pages), categories live in a parallel map keyed by photo URL. That keeps
 * every existing consumer working untouched and makes the feature additive:
 * a listing nobody has categorized renders in exactly the order it does now.
 */

export type PhotoCategory =
  | "exterior-front"
  | "kitchen"
  | "living"
  | "primary-bedroom"
  | "dining"
  | "bathroom"
  | "bedroom"
  | "exterior-rear"
  | "view"
  | "amenity"
  | "floorplan"
  | "other";

/**
 * Display order, not a ranking of rooms. It mirrors how a listing brochure is
 * actually laid out: the street view establishes the property, then the two
 * rooms buyers decide on (kitchen, main living space), then the primary suite.
 * `orderPhotos` sorts by this, so the brochure's hero + three secondary slots
 * fill themselves correctly once an agent has tagged even a few photos.
 */
export const PHOTO_CATEGORIES: readonly {
  value: PhotoCategory;
  label: string;
}[] = [
  { value: "exterior-front", label: "Front exterior" },
  { value: "kitchen", label: "Kitchen" },
  { value: "living", label: "Living room" },
  { value: "primary-bedroom", label: "Primary bedroom" },
  { value: "dining", label: "Dining room" },
  { value: "bathroom", label: "Bathroom" },
  { value: "bedroom", label: "Bedroom" },
  { value: "exterior-rear", label: "Yard / rear exterior" },
  { value: "view", label: "View" },
  { value: "amenity", label: "Amenity" },
  { value: "floorplan", label: "Floor plan" },
  { value: "other", label: "Other" },
] as const;

const PRIORITY = new Map<PhotoCategory, number>(
  PHOTO_CATEGORIES.map((category, index) => [category.value, index])
);

export function isPhotoCategory(value: unknown): value is PhotoCategory {
  return typeof value === "string" && PRIORITY.has(value as PhotoCategory);
}

export function photoCategoryLabel(category: PhotoCategory): string {
  return (
    PHOTO_CATEGORIES.find((entry) => entry.value === category)?.label ?? "Other"
  );
}

/**
 * Photo URL → category. Stored on the listing and carried onto the campaign
 * brief. Absent keys simply mean "not categorized yet" — never an error.
 */
export type PhotoCategoryMap = Record<string, PhotoCategory>;

/**
 * Returns `photos` ordered for display.
 *
 * Deliberately conservative: when nothing is categorized the input order is
 * returned untouched, so this can be dropped into every existing consumer
 * without changing a single listing that predates the feature. Uncategorized
 * photos always sort after categorized ones and keep their relative order, so
 * tagging one photo promotes exactly that photo and disturbs nothing else.
 */
export function orderPhotos(
  photos: readonly string[],
  categories?: PhotoCategoryMap | null
): string[] {
  if (!categories) return [...photos];
  const tagged = photos.some((url) => isPhotoCategory(categories[url]));
  if (!tagged) return [...photos];

  return photos
    .map((url, index) => {
      const category = categories[url];
      return {
        url,
        index,
        rank: isPhotoCategory(category)
          ? (PRIORITY.get(category) ?? PHOTO_CATEGORIES.length)
          : Number.POSITIVE_INFINITY,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.url);
}

/**
 * Keeps only entries whose key is a photo actually on the listing and whose
 * value is a real category. Used at the API boundary so a stale URL from a
 * since-replaced photo set can't accumulate on the document.
 */
export function sanitizePhotoCategories(
  value: unknown,
  photos: readonly string[]
): PhotoCategoryMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(photos);
  const result: PhotoCategoryMap = {};
  for (const [url, category] of Object.entries(value as Record<string, unknown>)) {
    if (allowed.has(url) && isPhotoCategory(category)) result[url] = category;
  }
  return result;
}

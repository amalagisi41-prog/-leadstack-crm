import { orderPhotos } from "@/lib/marketing/photo-categories";
import type { ContentBrief } from "@/types/marketing-campaigns";

/** Website Studio's facts-only Single Property template payload. */
export function SinglePropertyTemplate({ brief }: { brief: ContentBrief }) {
  const images = orderPhotos(brief.images, brief.photoCategories);
  return (
    <article className="mx-auto max-w-5xl space-y-6 rounded-2xl border bg-white p-6 text-neutral-900">
      <header>
        <p className="text-sm text-neutral-500">{brief.propertyType}</p>
        <h1 className="text-3xl font-semibold">{brief.title}</h1>
        <p className="mt-2 text-xl">${brief.price.toLocaleString()}</p>
      </header>
      {images.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {images.slice(0, 6).map((image) => (
            // eslint-disable-next-line @next/next/no-img-element -- IDX CDN URLs are operator-supplied.
            <img key={image} src={image} alt={brief.title} className="aspect-[4/3] w-full rounded-lg object-cover" />
          ))}
        </div>
      )}
      <p className="text-neutral-700">{brief.description}</p>
      <p className="text-sm text-neutral-600">{brief.beds} bd · {brief.baths} ba{brief.sqft ? ` · ${brief.sqft.toLocaleString()} sqft` : ""}</p>
      {brief.disclaimer && <p className="text-[11px] leading-relaxed text-neutral-400">{brief.disclaimer}</p>}
    </article>
  );
}

export function singlePropertyTemplateData(brief: ContentBrief) {
  return {
    type: "SingleProperty" as const,
    props: { title: brief.title, description: brief.description, primaryPhoto: orderPhotos(brief.images, brief.photoCategories)[0] ?? null },
  };
}

import type { ContentBrief } from "@/types/marketing-campaigns";

export function PropertyBrochure({ brief }: { brief: ContentBrief }) {
  const facts = [
    `${brief.beds} bedrooms`,
    `${brief.baths} bathrooms`,
    brief.sqft ? `${brief.sqft.toLocaleString()} square feet` : null,
    brief.yearBuilt ? `Built ${brief.yearBuilt}` : null,
  ].filter(Boolean);

  return (
    <article className="mx-auto min-h-[1056px] max-w-[816px] overflow-hidden bg-white text-slate-950 shadow-xl print:min-h-0 print:shadow-none">
      <header className="bg-slate-950 px-10 py-8 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">
          Casey&apos;s Property Group
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{brief.title}</h1>
        <p className="mt-2 text-lg text-slate-300">{brief.propertyType} · {brief.city}, {brief.state}</p>
      </header>
      {brief.images[0] && (
        // eslint-disable-next-line @next/next/no-img-element -- brochure images are stored listing assets.
        <img src={brief.images[0]} alt={brief.title} className="h-[330px] w-full object-cover" />
      )}
      <div className="space-y-7 px-10 py-8">
        <div className="flex items-end justify-between gap-4 border-b pb-6">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-slate-500">For sale</p>
            <p className="mt-1 text-3xl font-semibold">${brief.price.toLocaleString()}</p>
          </div>
          <p className="text-right text-sm text-slate-600">{brief.address}<br />{brief.city}, {brief.state} {brief.zip}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {facts.map((fact) => <div key={fact} className="rounded-lg bg-slate-100 px-3 py-3 text-center text-sm font-medium">{fact}</div>)}
        </div>
        <p className="text-base leading-7 text-slate-700">{brief.description}</p>
        {brief.images.length > 1 && (
          <div className="grid grid-cols-3 gap-3">
            {brief.images.slice(1, 4).map((image) => (
              // eslint-disable-next-line @next/next/no-img-element -- brochure images are stored listing assets.
              <img key={image} src={image} alt={brief.title} className="aspect-[4/3] w-full rounded-md object-cover" />
            ))}
          </div>
        )}
        <div className="border-t pt-5 text-xs leading-5 text-slate-500">
          <p>Request details or a private showing from Casey&apos;s Property Group.</p>
          {brief.disclaimer && <p className="mt-3">{brief.disclaimer}</p>}
        </div>
      </div>
    </article>
  );
}

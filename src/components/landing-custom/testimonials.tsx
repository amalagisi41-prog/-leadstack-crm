import { Star } from "lucide-react";

const testimonials = [
  {
    quote:
      "I used to lose 2–3 leads a week just because I was with another client when they called. LeadStack's AI receptionist now qualifies every Zillow lead immediately. I closed an extra $24k in commissions last month alone.",
    name: "Marcus R.",
    title: "Realtor® · Maplewood, NJ · 11 years",
    initials: "MR",
    color: "bg-blue-500",
  },
  {
    quote:
      "I've tried everything — KvCORE, Chime, Follow Up Boss. This is the first CRM I've actually kept using past 90 days. The pipeline view tells me exactly what to do each morning. I stopped losing deals to forgetting.",
    name: "Tanya K.",
    title: "Top Producer · Austin, TX · GCI $380k",
    initials: "TK",
    color: "bg-blue-500",
  },
  {
    quote:
      "My team of 6 agents all have their own sub-accounts. I can see everyone's pipeline from one dashboard and route new leads to the right agent automatically. Setup took an afternoon — not a week.",
    name: "David L.",
    title: "Team Lead · Boca Raton, FL · 6 agents",
    initials: "DL",
    color: "bg-purple-500",
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
            Real results
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            Agents who stopped{" "}
            <span className="font-serif font-normal italic">losing leads</span>
          </h2>
        </div>

        <div className="mx-auto max-w-5xl grid gap-6 sm:grid-cols-3">
          {testimonials.map(({ quote, name, title, initials, color }) => (
            <div
              key={name}
              className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm"
            >
              <Stars />
              <p className="text-sm leading-relaxed text-muted-foreground flex-1">
                &ldquo;{quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-2 border-t">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${color} text-white text-sm font-bold`}>
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-xs text-muted-foreground">{title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

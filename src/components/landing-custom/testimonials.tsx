import { Star } from "lucide-react";

const testimonials = [
  {
    quote:
      "I used to lose 2–3 leads a week just because I was with another client when they called. Now every Zillow lead gets qualified immediately, even when I can't pick up. I closed an extra $24k in commissions last month alone.",
    name: "Marcus R.",
    title: "Realtor® · Maplewood, NJ · 11 years",
    initials: "MR",
    metric: "$24k",
    metricLabel: "extra commissions last month",
    color: "bg-blue-500",
  },
  {
    quote:
      "I've tried everything — KvCORE, Chime, Follow Up Boss. This is the first system I've actually kept using past 90 days. It tells me exactly what to do each morning. I stopped losing deals to forgetting.",
    name: "Tanya K.",
    title: "Top Producer · Austin, TX · GCI $380k",
    initials: "TK",
    metric: "90+ days",
    metricLabel: "still using it every morning",
    color: "bg-indigo-500",
  },
  {
    quote:
      "My team of 6 agents all have their own sub-accounts. I can see everyone's deals from one dashboard and route new leads to the right agent automatically. Setup took an afternoon — not a week.",
    name: "David L.",
    title: "Team Lead · Boca Raton, FL · 6 agents",
    initials: "DL",
    metric: "6 agents",
    metricLabel: "all in one dashboard",
    color: "bg-blue-600",
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className="h-4 w-4 fill-blue-400 text-blue-400" />
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="bg-[#FFF8EF] py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
            The kind of results agents see
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
            Stop{" "}
            <span className="font-sans font-normal italic text-[#DB4F9B]">
              losing leads
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#526078]">
            Illustrative examples of outcomes AgentStack is built to drive. Real
            customer stories will replace these as they come in.
          </p>
        </div>

        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-3">
          {testimonials.map(({ quote, name, title, initials, metric, metricLabel, color }) => (
            <div
              key={name}
              className="flex flex-col gap-4 rounded-[1.75rem] border border-[#E7DCC7] bg-[#FFFDFC] p-6 shadow-[0_14px_40px_rgba(23,59,122,0.06)]"
            >
              <Stars />
              <div className="rounded-xl border border-[#E7DCC7] bg-[#FFF8EF] px-3 py-2 text-center">
                <span className="text-xl font-semibold text-[#173B7A]">{metric}</span>
                <p className="mt-0.5 text-[10px] text-[#7B8AA1]">{metricLabel}</p>
              </div>
              <p className="flex-1 text-sm leading-relaxed text-[#526078]">
                &ldquo;{quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 border-t border-[#EFE4D3] pt-2">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${color} text-white text-sm font-bold`}>
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#173B7A]">{name}</p>
                  <p className="text-xs text-[#7B8AA1]">{title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

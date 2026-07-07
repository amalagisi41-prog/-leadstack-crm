import { Star } from "lucide-react";

const testimonials = [
  {
    quote:
      "I used to lose 2–3 leads a week just because I was with another client when they called. AgentStack's AI receptionist now qualifies every Zillow lead immediately. I closed an extra $24k in commissions last month alone.",
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
      "My team of 6 agents all have their own sub-accounts. I can see everyone's pipeline from one dashboard and route new leads to the right agent automatically. Setup took an afternoon — not a week.",
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
    <section className="bg-[#1a2540] py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-400 mb-2">
            The kind of results agents see
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter text-white sm:text-5xl">
            Stop{" "}
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text font-sans font-normal italic text-transparent">
              losing leads
            </span>
          </h2>
          <p className="mt-3 text-xs text-blue-200/60">
            Illustrative examples of outcomes AgentStack is built to drive. Real
            customer stories will replace these as they come in.
          </p>
        </div>

        <div className="mx-auto max-w-5xl grid gap-6 sm:grid-cols-3">
          {testimonials.map(({ quote, name, title, initials, metric, metricLabel, color }) => (
            <div
              key={name}
              className="flex flex-col gap-4 rounded-2xl border border-[#2a3f5f]/60 bg-[#1e3050]/50 p-6"
            >
              <Stars />
              <div className="rounded-xl bg-blue-600/10 border border-blue-600/20 px-3 py-2 text-center">
                <span className="text-xl font-bold text-blue-400">{metric}</span>
                <p className="text-[10px] text-blue-300/70 mt-0.5">{metricLabel}</p>
              </div>
              <p className="text-sm leading-relaxed text-blue-100/70 flex-1">
                &ldquo;{quote}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-2 border-t border-[#2a3f5f]/60">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${color} text-white text-sm font-bold`}>
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{name}</p>
                  <p className="text-xs text-blue-300/60">{title}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

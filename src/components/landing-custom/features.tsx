import { Zap, Columns, CalendarCheck, Star, Globe, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Speed-to-lead — every time",
    body: "The first agent to respond wins. LeadStack fires a personal text and email within 60 seconds of any new inquiry — from your website, Zillow, or a yard sign text — even while you're in a showing.",
    color: "bg-amber-500/10 text-amber-500",
  },
  {
    icon: Columns,
    title: "Pipeline that shows you what to do next",
    body: "Drag deals from inquiry to closing. Stage timers surface which clients have been waiting too long. You'll never wonder what to work on when you sit down.",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    icon: CalendarCheck,
    title: "Showings scheduled automatically",
    body: "Your public booking page lets buyers pick a slot from your available hours. ICS confirmation emails go out automatically. No back-and-forth, no missed appointments.",
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    icon: Star,
    title: "Google reviews on autopilot",
    body: "LeadStack sends a review request at the perfect moment — right after closing, when satisfaction is highest. More five-star reviews, less asking awkwardly.",
    color: "bg-emerald-500/10 text-emerald-500",
  },
  {
    icon: Globe,
    title: "White-label client sites",
    body: "Publish a professional listing or landing page for each client in minutes, branded to your brokerage. Built-in lead capture form feeds straight into your pipeline.",
    color: "bg-teal-500/10 text-teal-500",
  },
  {
    icon: BarChart3,
    title: "GCI tracker — not a spreadsheet",
    body: "GCI by month, pipeline value by stage, leads by source. Everything updates live. Share a read-only link with your broker — no Excel exports, no copy-paste errors.",
    color: "bg-rose-500/10 text-rose-500",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Built for top producers
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-5xl">
            Everything a closing agent needs.{" "}
            <span className="font-serif font-normal italic">
              Simple enough to actually use.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Top producers don&apos;t have time to learn software. LeadStack is set up in a day and pays for itself with one closed deal.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body, color }) => (
            <div
              key={title}
              className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

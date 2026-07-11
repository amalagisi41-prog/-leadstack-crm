import { Zap, Users, CalendarCheck, Star, Globe, BarChart3, Gem } from "lucide-react";

const features = [
  {
    icon: Gem,
    title: "Built for how you actually work",
    body: "Tell it whether you're a Solo Agent, a Team, a Broker, or a Luxury Broker — the stages every deal moves through, how your assistant talks to clients, and your follow-up schedule all adjust automatically. Nothing to configure yourself.",
    color: "bg-indigo-500/10 text-indigo-500",
  },
  {
    icon: Zap,
    title: "Every lead answered instantly",
    body: "AI responds in under 60 seconds via text, email, web chat, and phone — even while you're in a showing. The first agent to respond wins. That's always you.",
    color: "bg-amber-500/10 text-amber-500",
  },
  {
    icon: Users,
    title: "Active clients, not a spreadsheet",
    body: "See exactly where every buyer and seller sits. Drag deals from inquiry to closing. Stage timers surface who's been waiting too long — so you always know what to work on next.",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    icon: CalendarCheck,
    title: "Showings book themselves",
    body: "Your public booking page lets buyers pick a slot from your available hours. ICS confirmations go out automatically. No back-and-forth, no missed appointments.",
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    icon: Star,
    title: "Reviews without the awkward ask",
    body: "AgentStack sends a Google review request at the perfect moment — right after closing, when satisfaction is highest. More five-star reviews, less asking.",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    icon: Globe,
    title: "Lead capture that actually converts",
    body: "Launch proven systems — home valuations, buyer consultations, open houses — with one click. Every submission feeds directly into your follow-up plan.",
    color: "bg-teal-500/10 text-teal-500",
  },
  {
    icon: BarChart3,
    title: "Know your numbers without trying",
    body: "GCI by month, deal value by stage, leads by source. Everything updates live. No Excel exports, no copy-paste errors.",
    color: "bg-rose-500/10 text-rose-500",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-white py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            What happens once it&apos;s set up
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-5xl">
            Less configuring.{" "}
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text font-sans font-normal italic text-transparent">
              More closing.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            You shouldn&apos;t need a tech degree to run your business — and you won&apos;t need one here. AgentStack sets up in 15 minutes, then runs quietly in the background while you work with clients.
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

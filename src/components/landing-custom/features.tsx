import { Zap, Users, CalendarCheck, Star, Globe, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Respond between showings — Private Preview",
    body: "AI Web Chat and AI Assist, plus SMS and voice automation, are Private Preview. Review channel setup and consent before responding to buyer inquiries.",
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
    title: "Closing follow-up — Private Preview",
    body: "SMS automation is Private Preview. Review a post-closing follow-up workflow before inviting a past client to leave a review.",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    icon: Globe,
    title: "Lead capture that actually converts",
    body: "Create lead forms for buyer consultations, listing inquiries, and open houses. Submissions create contacts in your real estate workspace.",
    color: "bg-teal-500/10 text-teal-500",
  },
  {
    icon: BarChart3,
    title: "Know your numbers without trying",
    body: "Track buyer and seller opportunities in your pipeline, organize closing tasks, and see which relationships need your attention next.",
    color: "bg-rose-500/10 text-rose-500",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-[#FFF8EF] py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
            What AgentStack does for you
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
            Less configuring.{" "}
            <span className="font-sans font-normal italic text-[#DB4F9B]">
              More closing.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#526078] sm:text-lg">
            Keep your sphere, buyer consultations, listing appointments, and offers organized while you focus on the next closing.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body, color }) => (
            <div
              key={title}
              className="group rounded-[1.5rem] border border-[#E7DCC7] bg-[#FFFDFC] p-5 shadow-[0_12px_32px_rgba(23,59,122,0.05)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_48px_rgba(23,59,122,0.08)] sm:p-6"
            >
              <span className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold text-[#173B7A]">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[#526078]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

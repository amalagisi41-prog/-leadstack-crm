import {
  ArrowRight,
  CalendarCheck2,
  MessageSquareReply,
  Route,
} from "lucide-react";

const outcomes = [
  {
    icon: MessageSquareReply,
    title: "A faster first response",
    description:
      "Connect one lead source and configure an approved first-touch workflow so new inquiries do not sit unattended.",
  },
  {
    icon: Route,
    title: "A visible next action",
    description:
      "Move every active opportunity through one clear lead-to-appointment workflow instead of managing scattered reminders.",
  },
  {
    icon: CalendarCheck2,
    title: "A booked appointment",
    description:
      "Use a lead form, follow-up sequence, and booking page together—the core outcome AgentStack Solo is designed to deliver.",
  },
];

export function SoloOutcomes() {
  return (
    <section className="bg-[#FFF8EF] py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-2 text-sm font-semibold tracking-[0.28em] text-[#173B7A] uppercase">
            AgentStack Solo outcomes
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
            Prove one workflow.{" "}
            <span className="font-sans font-normal text-[#DB4F9B] italic">
              Then expand.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#526078] sm:text-lg">
            We focus on measurable outcomes. Members configure and measure a
            real lead-to-appointment workflow in their own business.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-6 md:grid-cols-3">
          {outcomes.map(({ icon: Icon, title, description }, index) => (
            <article
              key={title}
              className="rounded-[1.75rem] border border-[#E7DCC7] bg-[#FFFDFC] p-6 shadow-[0_14px_40px_rgba(23,59,122,0.06)]"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#173B7A] text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold tracking-[0.2em] text-[#7B8AA1] uppercase">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-6 text-xl font-semibold text-[#173B7A]">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#526078]">
                {description}
              </p>
            </article>
          ))}
        </div>

        <a
          href="/availability"
          className="mx-auto mt-8 flex w-fit items-center gap-2 text-sm font-semibold text-[#173B7A] hover:text-[#DB4F9B]"
        >
          See what is Live, in Private Preview, and Coming Soon{" "}
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}

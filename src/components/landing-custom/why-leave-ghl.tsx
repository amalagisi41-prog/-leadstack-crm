import { SOLO_PRICE } from "@/lib/public-site/offer";

export function WhyLeaveGhl() {
  return (
    <section className="bg-white px-4 py-16 text-[#173B7A]">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold tracking-tight">
          Why agents leave GoHighLevel
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            [
              "No blank-canvas setup",
              "The six-step guided Build configures the system around your real estate business: buyers, sellers, your sphere, and your farm areas.",
            ],
            [
              "No generic-industry bloat",
              "Every pipeline stage, template, and automation is written for real estate, from a new buyer inquiry to a closing. Automation channels remain Private Preview.",
            ],
            [
              "No agency markup",
              `One Solo plan, built for a working agent’s P&L. Public price: $${SOLO_PRICE}/month.`,
            ],
          ].map(([title, body]) => (
            <div
              key={title}
              className="rounded-[1.5rem] border border-[#E7DCC7] bg-[#FFFDFC] p-6"
            >
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 leading-7 text-[#526078]">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import { AlertCircle } from "lucide-react";

const pains = [
  {
    emoji: "📱",
    heading: "You were showing a house when the Zillow lead came in.",
    body: "By the time you saw the notification, they'd already booked with someone else. Speed-to-lead is everything — and you can't always be fast.",
  },
  {
    emoji: "📋",
    heading: "You said you'd follow up — but never did.",
    body: "Seven touchpoints is the conversion sweet spot. Most agents send one. AgentStack runs the entire follow-up sequence automatically so nothing slips through.",
  },
  {
    emoji: "🧠",
    heading: "Every deal lives in your head, not a system.",
    body: "When a buyer goes quiet after \"Showing Scheduled,\" you don't notice until they're gone. One glance shows exactly who's stalled and for how long — no spreadsheet, no memory required.",
  },
];

export function PainPoints() {
  return (
    <section className="bg-[#1a2540] py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-xs font-medium text-blue-300 mb-4">
            <AlertCircle className="h-3.5 w-3.5" />
            Sound familiar?
          </div>
          <h2 className="text-3xl font-semibold tracking-tighter text-white sm:text-4xl">
            You don&apos;t have a lead problem.{" "}
            <span className="font-sans font-normal italic text-blue-300">You have a systems problem.</span>
          </h2>
        </div>

        <div className="mx-auto max-w-4xl grid gap-6 sm:grid-cols-3">
          {pains.map(({ emoji, heading, body }) => (
            <div
              key={heading}
              className="rounded-2xl border border-[#2a3f5f]/60 bg-[#1e3050]/50 p-6"
            >
              <div className="mb-4 text-3xl">{emoji}</div>
              <h3 className="text-sm font-semibold leading-snug mb-2 text-white">{heading}</h3>
              <p className="text-sm text-blue-200/70 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

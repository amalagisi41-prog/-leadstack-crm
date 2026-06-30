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
    body: "Seven touchpoints is the conversion sweet spot. Most agents send one. LeadStack runs the whole sequence automatically so nothing slips through.",
  },
  {
    emoji: "🧠",
    heading: "Your pipeline lives in your head.",
    body: "When a deal sits too long at \"Showing Scheduled,\" you don't notice until it's dead. A visual pipeline with stage timers makes the problem obvious.",
  },
];

export function PainPoints() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/5 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 mb-4">
            <AlertCircle className="h-3.5 w-3.5" />
            Sound familiar?
          </div>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-4xl">
            The leads were there.{" "}
            <span className="font-serif font-normal italic">The follow-up wasn&apos;t.</span>
          </h2>
        </div>

        <div className="mx-auto max-w-4xl grid gap-6 sm:grid-cols-3">
          {pains.map(({ emoji, heading, body }) => (
            <div
              key={heading}
              className="rounded-2xl border bg-card p-6 shadow-sm"
            >
              <div className="mb-4 text-3xl">{emoji}</div>
              <h3 className="text-sm font-semibold leading-snug mb-2">{heading}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

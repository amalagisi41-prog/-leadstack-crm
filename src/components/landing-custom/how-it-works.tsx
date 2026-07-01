import { Inbox, Bot, PhoneCall, Star } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Inbox,
    title: "Lead comes in",
    body: "From Zillow, your website, a yard sign text, or a referral — LeadStack captures every inquiry and responds in under 60 seconds.",
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10",
    numColor: "text-blue-600",
    numBg: "bg-blue-50 border-blue-200",
  },
  {
    number: "02",
    icon: Bot,
    title: "AI qualifies the lead",
    body: "Your AI receptionist texts back, answers property questions, books a showing, and tells you exactly who's hot and ready to move.",
    iconColor: "text-indigo-500",
    iconBg: "bg-indigo-500/10",
    numColor: "text-indigo-600",
    numBg: "bg-indigo-50 border-indigo-200",
  },
  {
    number: "03",
    icon: PhoneCall,
    title: "You take the warm lead",
    body: "See exactly where each buyer or seller sits in your pipeline. Jump in when they're ready — no more cold callbacks to strangers.",
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10",
    numColor: "text-blue-600",
    numBg: "bg-blue-50 border-blue-200",
  },
  {
    number: "04",
    icon: Star,
    title: "Close and get your review",
    body: "LeadStack follows up from offer to closing day — then automatically asks for a Google review at exactly the right moment.",
    iconColor: "text-indigo-500",
    iconBg: "bg-indigo-500/10",
    numColor: "text-indigo-600",
    numBg: "bg-indigo-50 border-indigo-200",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 mb-2">
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            From cold inquiry to{" "}
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text font-serif font-normal italic text-transparent">
              closed deal
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Four steps that run mostly on autopilot — so you can focus on what only you can do.
          </p>
        </div>

        <div className="mx-auto max-w-4xl">
          <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Connecting dashed line */}
            <div className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-5 hidden h-px lg:block"
              style={{ background: "repeating-linear-gradient(to right, oklch(0.546 0.245 262.881) 0, oklch(0.546 0.245 262.881) 6px, transparent 6px, transparent 14px)" }}
            />

            {steps.map(({ number, icon: Icon, title, body, iconColor, iconBg, numColor, numBg }) => (
              <div key={title} className="relative flex flex-col">
                <div className="relative z-10 mb-4 flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold ${numBg} ${numColor}`}>
                    {number}
                  </div>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                </div>
                <h3 className="text-base font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

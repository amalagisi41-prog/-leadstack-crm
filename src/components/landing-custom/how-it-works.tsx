import { Inbox, Bot, PhoneCall, Star } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Inbox,
    title: "Lead comes in",
    body: "From Zillow, your website, a yard sign text, or a referral — LeadStack captures every inquiry and sends a personal response in under 60 seconds.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    number: "02",
    icon: Bot,
    title: "AI qualifies the lead",
    body: "Your AI receptionist texts back, answers property questions, books a showing, and tells you exactly who's hot and ready to move.",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    number: "03",
    icon: PhoneCall,
    title: "You take the warm lead",
    body: "See exactly where each buyer or seller sits in your pipeline. Jump in when they're ready — no more cold callbacks to strangers.",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    number: "04",
    icon: Star,
    title: "Close and get your review",
    body: "LeadStack follows up from offer to closing day — then automatically asks for a Google review at exactly the right moment.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            From cold inquiry to{" "}
            <span className="font-serif font-normal italic">closed deal</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Four steps that run mostly on autopilot — so you can focus on what only you can do.
          </p>
        </div>

        <div className="mx-auto max-w-4xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ number, icon: Icon, title, body, color, bg }, i) => (
              <div key={title} className="relative flex flex-col">
                {i < steps.length - 1 && (
                  <div className="absolute left-10 top-5 hidden h-0.5 w-[calc(100%+2rem)] bg-border lg:block" />
                )}
                <div className={`relative z-10 mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div className="mb-1 text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">
                  {number}
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

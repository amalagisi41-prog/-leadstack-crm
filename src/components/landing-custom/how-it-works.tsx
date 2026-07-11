import { Wrench, Link2, Target, Zap, RefreshCw, Trophy } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Wrench,
    title: "Build",
    body: "Tell AgentStack whether you're a Solo Agent, a Team, a Broker, or a Luxury Broker. It sets up the stages every deal moves through, how your assistant talks to clients, and your follow-up schedule to match — no forms to build, no settings to hunt for.",
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10",
    numColor: "text-blue-600",
    numBg: "bg-blue-50 border-blue-200",
  },
  {
    number: "02",
    icon: Link2,
    title: "Connect",
    body: "Import contacts. Connect email, phone, calendar, Google Business Profile, website, and social accounts.",
    iconColor: "text-indigo-500",
    iconBg: "bg-indigo-500/10",
    numColor: "text-indigo-600",
    numBg: "bg-indigo-50 border-indigo-200",
  },
  {
    number: "03",
    icon: Target,
    title: "Capture",
    body: "Launch lead capture systems — home valuations, buyer consultations, open houses, listing inquiries — with one click.",
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10",
    numColor: "text-blue-600",
    numBg: "bg-blue-50 border-blue-200",
  },
  {
    number: "04",
    icon: Zap,
    title: "Respond",
    body: "Every lead answered immediately. Automatic follow-up begins instantly — even while you're in a showing.",
    iconColor: "text-indigo-500",
    iconBg: "bg-indigo-500/10",
    numColor: "text-indigo-600",
    numBg: "bg-indigo-50 border-indigo-200",
  },
  {
    number: "05",
    icon: RefreshCw,
    title: "Nurture",
    body: "AgentStack keeps every conversation moving until someone responds. No manual reminders. No forgotten leads.",
    iconColor: "text-blue-500",
    iconBg: "bg-blue-500/10",
    numColor: "text-blue-600",
    numBg: "bg-blue-50 border-blue-200",
  },
  {
    number: "06",
    icon: Trophy,
    title: "Close",
    body: "Appointments. Transactions. Reviews. Referrals. Repeat. The system runs — you close.",
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
            The AgentStack Method™
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            Set up once.{" "}
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text font-sans font-normal italic text-transparent">
              It runs everything.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Six steps to a business that works while you&apos;re with clients.
          </p>
        </div>

        <div className="mx-auto max-w-5xl">
          <div className="relative grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
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

import Link from "next/link";
import { ArrowRight, Wrench, Link2, Target, Zap, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    number: "01",
    icon: Wrench,
    title: "Build",
    body: "Tell AgentStack about your business once — services, hours, follow-up rules. It configures everything around it.",
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
    <section id="how-it-works" className="relative overflow-hidden bg-white py-24 md:py-28">
      <div className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full bg-[#DB4F9B]/10 blur-3xl" />
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center mb-14">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
            The AgentStack Method™
          </p>
          <h2 className="text-balance text-4xl font-semibold tracking-[-0.04em] text-[#173B7A] sm:text-6xl">
            Set up your business once.{" "}
            <span className="font-normal italic text-[#DB4F9B]">
              Keep it moving every day.
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#526078] sm:text-lg">
            A guided operating system—not another empty CRM. AgentStack builds the process, activates the follow-up, and tells you what matters next.
          </p>
        </div>

        <div className="mx-auto max-w-6xl">
          <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map(({ number, icon: Icon, title, body, iconColor, iconBg, numColor, numBg }) => (
              <div
                key={title}
                className="group relative flex min-h-60 flex-col rounded-[1.75rem] border border-[#E7DCC7] bg-[#FFFDFC] p-6 shadow-[0_12px_32px_rgba(23,59,122,0.05)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_48px_rgba(23,59,122,0.08)]"
              >
                <div className="relative z-10 mb-8 flex items-center justify-between gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold ${numBg} ${numColor}`}>
                    {number}
                  </div>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                </div>
                <h3 className="mb-2 text-xl font-semibold text-[#173B7A]">{title}</h3>
                <p className="text-sm leading-6 text-[#526078]">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center justify-between gap-5 rounded-[1.75rem] border border-[#E7DCC7] bg-[#FFF8EF] px-6 py-6 sm:flex-row">
            <div>
              <p className="font-semibold text-[#173B7A]">
                You stay with the client. AgentStack keeps the business moving.
              </p>
              <p className="mt-1 text-sm text-[#526078]">
                Start with the next recommended action—never a blank dashboard.
              </p>
            </div>
            <Button
              render={<Link href="/signup" />}
              className="shrink-0 bg-[#173B7A] text-white hover:bg-[#214b95]"
            >
              Build my system <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

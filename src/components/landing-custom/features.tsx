import {
  Bell,
  Bot,
  Calendar,
  CheckSquare,
  DollarSign,
  MessageSquare,
  Phone,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Every buyer & seller in one place",
    body:
      "Clean contact profiles with notes, activity history, and deal status. Import your existing database in 30 seconds — no data loss, no manual re-entry.",
  },
  {
    icon: Zap,
    title: "First to respond wins — automatically",
    body:
      "A new lead fills out your form and gets a personal text within seconds. Speed-to-lead automations run while you're showing a listing, sleeping, or closing another deal.",
  },
  {
    icon: Bot,
    title: "AI that qualifies leads for you",
    body:
      "Your AI agent handles inbound texts, web chat, and calls 24/7 — answers questions, books showings, and escalates hot leads straight to you.",
  },
  {
    icon: MessageSquare,
    title: "Text, email, and call from one screen",
    body:
      "Reply to a lead's text, fire off a showing confirmation email, or dial straight from the contact profile. Every conversation is logged automatically.",
  },
  {
    icon: TrendingUp,
    title: "Pipeline that shows you what to do next",
    body:
      "Drag deals from inquiry to closing. Stage timers show which clients have been waiting too long. You'll never wonder what to work on when you sit down.",
  },
  {
    icon: Calendar,
    title: "Showings, inspections, and closings — organized",
    body:
      "Link calendar events to contacts, get due-today task badges, and set automated reminders. Your schedule talks to your CRM.",
  },
  {
    icon: Bell,
    title: "Never miss a follow-up",
    body:
      "Automated drip sequences keep you top-of-mind for buyers still 6 months out. The system follows up so you don't have to remember.",
  },
  {
    icon: DollarSign,
    title: "Send quotes & offers in 60 seconds",
    body:
      "Build a professional estimate or buyer/seller proposal, send it via email, and get a one-click acceptance back. No PDF wrangling.",
  },
  {
    icon: CheckSquare,
    title: "Know your numbers without a spreadsheet",
    body:
      "GCI by month, pipeline value by stage, leads by source. Everything updates live. Share a link with your broker — no Excel exports.",
  },
  {
    icon: Phone,
    title: "Book showings automatically",
    body:
      "Your public booking page lets buyers pick a slot from your available hours. Confirmation emails go out automatically with calendar invites.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Built for realtors
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-5xl">
            Everything a top producer needs.{" "}
            <span className="font-serif font-normal italic">
              Simple enough to actually use.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            High-end agents don&apos;t have time to learn software. AgentEdge is set up in a day and pays for itself with one closed deal.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
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

import { Check, Phone, CalendarCheck, Star, Users } from "lucide-react";

const planItems = [
  { icon: Phone, label: "Call John Martinez", meta: "Hot lead, no response in 2 days" },
  { icon: CalendarCheck, label: "Showing at 2:00 PM", meta: "118 Ridge Rd · buyer confirmed" },
  { icon: Star, label: "Send review request", meta: "Thompson closing — 3 days ago" },
  { icon: Users, label: "3 new leads waiting", meta: "Zillow, Realtor.com, web chat" },
];

const healthChecks = [
  { label: "Connect Google Business Profile", done: true },
  { label: "Import your contacts", done: true },
  { label: "Publish your website", done: true },
  { label: "Send review requests", done: false },
];

const HEALTH_SCORE = 94;

export function TodayPlan() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-600">
                Every morning
              </p>
              <h2 className="mb-4 text-3xl font-semibold tracking-tighter sm:text-4xl">
                Know exactly what to do.{" "}
                <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text font-sans font-normal italic text-transparent">
                  Before you open your laptop.
                </span>
              </h2>
              <p className="mb-6 leading-relaxed text-muted-foreground">
                AgentStack turns yesterday&apos;s activity into today&apos;s plan —
                who to call, who&apos;s booked, who needs a nudge. Log in and the
                work is already organized for you.
              </p>
              <ul className="space-y-3">
                {[
                  "A prioritized list of who to call and why",
                  "Today's showings and follow-ups, already scheduled",
                  "A live health score so you know what needs attention",
                  "New leads waiting, right at the top",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-600">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-5">
              {/* Today's Plan mockup */}
              <div className="overflow-hidden rounded-2xl border bg-card shadow-xl">
                <div className="flex items-center gap-3 border-b bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
                    S
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">
                      Good morning, Sarah
                    </p>
                    <p className="text-[10px] text-blue-100">
                      4 things need your attention today
                    </p>
                  </div>
                </div>
                <div className="divide-y bg-background">
                  {planItems.map(({ icon: Icon, label, meta }) => (
                    <div key={label} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{label}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {meta}
                        </p>
                      </div>
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-blue-500/30" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Business Health mockup */}
              <div className="overflow-hidden rounded-2xl border bg-card shadow-xl">
                <div className="flex items-center gap-4 px-4 py-4">
                  <div
                    className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(oklch(0.6 0.18 263) ${HEALTH_SCORE}%, oklch(0.92 0.01 263) 0)`,
                    }}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card text-sm font-bold text-blue-600">
                      {HEALTH_SCORE}%
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold">Business Health</p>
                    <p className="text-[10px] text-muted-foreground">
                      One step left to fully set up
                    </p>
                  </div>
                </div>
                <div className="divide-y border-t bg-background">
                  {healthChecks.map(({ label, done }) => (
                    <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                          done
                            ? "bg-emerald-500/15 text-emerald-600"
                            : "border-2 border-muted-foreground/30"
                        }`}
                      >
                        {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                      </span>
                      <p
                        className={`text-xs ${done ? "text-muted-foreground line-through" : "font-medium"}`}
                      >
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

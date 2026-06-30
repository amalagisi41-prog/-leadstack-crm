import { MapPin, Users, TrendingUp } from "lucide-react";

const farmStats = [
  { label: "Contacts in your farm", value: "247", icon: Users, color: "text-blue-500" },
  { label: "Avg days to first contact", value: "0.4", icon: TrendingUp, color: "text-emerald-500" },
  { label: "Active territories", value: "3", icon: MapPin, color: "text-purple-500" },
];

const territories = [
  { name: "Maplewood North", contacts: 84, hot: 6, stage: "Showing Scheduled", color: "bg-blue-500" },
  { name: "South Orange", contacts: 63, hot: 4, stage: "New Inquiry", color: "bg-emerald-500" },
  { name: "Montclair Heights", contacts: 100, hot: 9, stage: "Offer In", color: "bg-purple-500" },
];

export function Territory() {
  return (
    <section id="team" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Territory map mockup */}
            <div className="rounded-2xl border bg-card shadow-xl overflow-hidden order-2 lg:order-1">
              <div className="flex items-center gap-2 border-b px-4 py-3 bg-muted/30">
                <MapPin className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-semibold">Territory Overview</span>
              </div>

              {/* Simplified visual map */}
              <div className="relative bg-muted/20 h-44 overflow-hidden">
                <div className="absolute inset-0 grid grid-cols-8 grid-rows-4 gap-0.5 p-2 opacity-20">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <div key={i} className="rounded-sm bg-border" />
                  ))}
                </div>
                {territories.map((t, i) => (
                  <div
                    key={t.name}
                    className="absolute flex items-center gap-1 rounded-full border bg-card px-2 py-1 shadow-sm text-[10px] font-medium"
                    style={{
                      top: `${20 + i * 30}%`,
                      left: `${10 + i * 25}%`,
                    }}
                  >
                    <span className={`h-2 w-2 rounded-full ${t.color}`} />
                    {t.name}
                  </div>
                ))}
                <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground">
                  Essex County, NJ
                </div>
              </div>

              <div className="p-4 space-y-3">
                {territories.map((t) => (
                  <div key={t.name} className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${t.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{t.name}</span>
                        <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{t.contacts} contacts</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${t.color} opacity-70`}
                          style={{ width: `${(t.hot / t.contacts) * 100 * 5}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                      {t.hot} hot
                    </span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 divide-x border-t">
                {farmStats.map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="flex flex-col items-center gap-1 py-3 px-2">
                    <Icon className={`h-3.5 w-3.5 ${color}`} />
                    <span className="text-base font-bold">{value}</span>
                    <span className="text-[9px] text-center text-muted-foreground leading-tight">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
                Territory farming
              </p>
              <h2 className="text-3xl font-semibold tracking-tighter sm:text-4xl mb-4">
                Know your farm.{" "}
                <span className="font-serif font-normal italic">Work it smarter.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                Stop guessing who&apos;s hot in your territory. LeadStack maps every contact to their neighborhood, shows you which leads haven&apos;t heard from you in too long, and routes new inquiries to the right agent automatically.
              </p>
              <ul className="space-y-3">
                {[
                  "Route inbound leads to agents by territory",
                  "See which neighborhoods have the most activity",
                  "Identify contacts overdue for a follow-up",
                  "Track GCI per territory for brokerage reporting",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

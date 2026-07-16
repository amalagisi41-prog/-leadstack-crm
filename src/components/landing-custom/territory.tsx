import { MapPin, Users, TrendingUp } from "lucide-react";

const farmStats = [
  { label: "Contacts in farm", value: "247", icon: Users, color: "text-blue-500" },
  { label: "Avg days to contact", value: "0.4", icon: TrendingUp, color: "text-indigo-500" },
  { label: "Active territories", value: "3", icon: MapPin, color: "text-blue-600" },
];

const territories = [
  { name: "Maplewood North", contacts: 84, hot: 6, color: "bg-blue-500" },
  { name: "South Orange", contacts: 63, hot: 4, color: "bg-indigo-500" },
  { name: "Montclair Heights", contacts: 100, hot: 9, color: "bg-blue-600" },
];

export function Territory() {
  return (
    <section id="team" className="bg-white py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            {/* Territory map mockup */}
            <div className="order-2 overflow-hidden rounded-[1.75rem] border border-[#E7DCC7] bg-[#FFFDFC] shadow-[0_24px_70px_rgba(23,59,122,0.08)] lg:order-1">
              <div className="flex items-center gap-2 border-b border-[#EFE4D3] bg-[#FFF8EF] px-4 py-3">
                <MapPin className="h-4 w-4 text-[#173B7A]" />
                <span className="text-xs font-semibold text-[#173B7A]">Territory Overview</span>
              </div>

              {/* Simplified visual map */}
              <div className="relative h-40 overflow-hidden bg-[#FFF8EF]">
                <div className="absolute inset-0 grid grid-cols-8 grid-rows-4 gap-0.5 p-2 opacity-15">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <div key={i} className="rounded-sm bg-[#E7DCC7]" />
                  ))}
                </div>
                {territories.map((t, i) => (
                  <div
                    key={t.name}
                    className="absolute flex items-center gap-1 rounded-full border border-[#E7DCC7] bg-white px-2 py-1 text-[10px] font-medium shadow-sm"
                    style={{
                      top: `${20 + i * 28}%`,
                      left: `${10 + i * 25}%`,
                    }}
                  >
                    <span className={`h-2 w-2 rounded-full ${t.color}`} />
                    {t.name}
                  </div>
                ))}
              </div>

              <div className="p-4 space-y-3">
                {territories.map((t) => (
                  <div key={t.name} className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${t.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-xs font-medium text-[#173B7A]">{t.name}</span>
                        <span className="ml-2 shrink-0 text-[10px] text-[#7B8AA1]">{t.contacts} contacts</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#EFE4D3]">
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
                    <span className="text-base font-bold text-[#173B7A]">{value}</span>
                    <span className="text-[9px] leading-tight text-center text-[#7B8AA1]">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
                Territory farming
              </p>
              <h2 className="mb-4 text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
                Know your farm.{" "}
                <span className="font-sans font-normal italic text-[#DB4F9B]">
                  Work it smarter.
                </span>
              </h2>
              <p className="mb-6 max-w-xl leading-7 text-[#526078]">
                Stop guessing who&apos;s hot in your territory. AgentStack maps every contact to their neighborhood, shows you which leads haven&apos;t heard from you in too long, and routes new inquiries to the right agent automatically.
              </p>
              <ul className="space-y-3">
                {[
                  "Route inbound leads to agents by territory",
                  "See which neighborhoods have the most activity",
                  "Identify contacts overdue for a follow-up",
                  "Track GCI per territory for brokerage reporting",
              ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#4F91FF]/15 text-[#4F91FF]">
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

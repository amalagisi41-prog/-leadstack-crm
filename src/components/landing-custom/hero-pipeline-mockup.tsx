import { Clock3, Database, Search, Tags } from "lucide-react";

const leads = [
  { name: "Sarah Thompson", source: "Website", status: "New", tone: "bg-pink-50 text-pink-600", time: "Just now" },
  { name: "Michael Rivera", source: "Zillow", status: "Contacted", tone: "bg-violet-50 text-violet-600", time: "1h ago" },
  { name: "Jessica Lee", source: "Referral", status: "Qualified", tone: "bg-emerald-50 text-emerald-600", time: "Yesterday" },
  { name: "David Chen", source: "Open House", status: "Showing", tone: "bg-sky-50 text-sky-600", time: "2d ago" },
  { name: "Amanda Foster", source: "Facebook Ad", status: "Nurture", tone: "bg-amber-50 text-amber-600", time: "3d ago" },
];

const benefits = [
  { icon: Database, title: "Centralized CRM", detail: "Every lead in one place." },
  { icon: Clock3, title: "Activity Timeline", detail: "See every interaction." },
  { icon: Tags, title: "Smart Tags & Filters", detail: "Find what matters fast." },
];

export function HeroPipelineMockup() {
  return (
    <section className="bg-[#FFF6E8] px-4 py-16 md:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.72fr_1.28fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#173B7A]/65">One organized system</p>
          <h2 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-[#173B7A] sm:text-5xl">
            All leads. <span className="font-normal italic text-[#DB4F9B]">Organized automatically.</span>
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-[#526078]">
            Every lead and conversation is captured, prioritized, and organized for you—without another spreadsheet or forgotten follow-up.
          </p>
          <div className="mt-7 space-y-4">
            {benefits.map(({ icon: Icon, title, detail }) => (
              <div key={title} className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DB4F9B] text-white shadow-sm"><Icon className="h-4 w-4" /></span>
                <div><p className="text-sm font-semibold text-[#173B7A]">{title}</p><p className="text-xs text-[#526078]">{detail}</p></div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative rounded-[2rem] border border-[#173B7A]/10 bg-gradient-to-br from-[#fbe4e5] via-[#f4efff] to-[#dce9f1] p-4 shadow-[0_30px_80px_rgba(23,59,122,0.16)] sm:p-8">
          <div className="overflow-hidden rounded-2xl border border-[#173B7A]/15 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div><p className="text-sm font-bold text-[#173B7A]">Leads</p><p className="text-[10px] text-[#526078]">Five people need your attention</p></div>
              <div className="flex items-center gap-2"><span className="hidden items-center gap-1 rounded-lg border px-2 py-1 text-[10px] text-[#526078] sm:flex"><Search className="h-3 w-3" /> Search leads</span><span className="rounded-lg bg-[#DB4F9B] px-3 py-1.5 text-[10px] font-semibold text-white">+ Add lead</span></div>
            </div>
            <div className="flex gap-4 overflow-hidden border-b px-4 py-2 text-[10px] font-medium text-[#526078]"><span className="rounded-full bg-pink-50 px-2 py-1 text-[#DB4F9B]">All Leads</span><span>New</span><span>Contacted</span><span>Qualified</span><span>Showing</span><span>Closed</span></div>
            <div className="divide-y">
              {leads.map((lead, index) => (
                <div key={lead.name} className="grid grid-cols-[1.4fr_.8fr_.8fr] items-center gap-2 px-4 py-3 text-[10px] sm:grid-cols-[1.5fr_.8fr_.8fr_.7fr]">
                  <div className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#173B7A] font-semibold text-white">{lead.name.split(" ").map((part) => part[0]).join("")}</span><div className="min-w-0"><p className="truncate font-semibold text-[#173B7A]">{lead.name}</p><p className="truncate text-[#526078]">lead{index + 1}@example.com</p></div></div>
                  <span className="text-[#526078]">{lead.source}</span>
                  <span className={`w-fit rounded-full px-2 py-1 font-medium ${lead.tone}`}>{lead.status}</span>
                  <span className="hidden text-right text-[#526078] sm:block">{lead.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

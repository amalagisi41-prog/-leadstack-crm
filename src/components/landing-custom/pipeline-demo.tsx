const columns = [
  {
    stage: "New Inquiry",
    color: "bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
    cards: [
      { name: "Jennifer K.", note: "Zillow · 3BR inquiry", time: "just now" },
      { name: "Alex T.", note: "Website form · buyer", time: "14m ago" },
      { name: "Robin O.", note: "Yard sign text", time: "31m ago" },
    ],
  },
  {
    stage: "Showing Scheduled",
    color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-400",
    dot: "bg-indigo-500",
    cards: [
      { name: "Chen Family", note: "22 Maple · Sat 10am", time: "1h ago" },
      { name: "David K.", note: "87 Park Ave · Sat 2pm", time: "2h ago" },
    ],
  },
  {
    stage: "Offer In",
    color: "bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-400",
    dot: "bg-purple-500",
    cards: [
      { name: "Williams Family", note: "$512k · accepted", time: "Yesterday" },
      { name: "Patel & Son", note: "$489k · countered", time: "Yesterday" },
    ],
  },
  {
    stage: "Under Contract",
    color: "bg-blue-600/10 border-blue-600/20 text-blue-800 dark:text-blue-300",
    dot: "bg-blue-700",
    cards: [
      { name: "J. Henderson", note: "Close Jan 10 · $638k", time: "3d ago" },
    ],
  },
  {
    stage: "Closed ✓",
    color: "bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400",
    dot: "bg-green-500",
    cards: [
      { name: "Kim & Park", note: "$580k · comm. $17.4k", time: "Last week" },
    ],
  },
];

export function PipelineDemo() {
  return (
    <section className="bg-white py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
            Live pipeline
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
            Every deal,{" "}
            <span className="font-sans font-normal italic text-[#DB4F9B]">
              exactly where it stands.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#526078] sm:text-lg">
            Drag deals across stages, see days-in-stage timers, and never lose track of a buyer again.
          </p>
        </div>

        <div className="mx-auto max-w-6xl overflow-x-auto rounded-[2rem] border border-[#E7DCC7] bg-[#FFFDFC] shadow-[0_24px_70px_rgba(23,59,122,0.08)]">
          <div className="flex items-center gap-2 border-b border-[#EFE4D3] bg-[#FFF8EF] px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-[#FF5F57]/80" />
            <div className="h-3 w-3 rounded-full bg-[#FEBC2E]/80" />
            <div className="h-3 w-3 rounded-full bg-[#28C840]/80" />
            <span className="ml-2 text-xs font-medium text-[#526078]">
              Active Clients — AgentStack
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#DB4F9B]" />
              <span className="text-[10px] text-[#526078]">live</span>
            </div>
          </div>

          <div className="min-w-[700px] grid grid-cols-5 gap-3 p-4">
            {columns.map((col) => (
              <div key={col.stage} className="flex flex-col gap-2">
                <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${col.color}`}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${col.dot}`} />
                  {col.stage}
                </div>
                <div className="flex flex-col gap-2">
                  {col.cards.map((c) => (
                    <div key={c.name} className="rounded-lg border border-[#E7DCC7] bg-white p-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-semibold leading-tight text-[#173B7A]">{c.name}</span>
                        <span className="shrink-0 text-[9px] text-[#7B8AA1]">{c.time}</span>
                      </div>
                      <p className="mt-0.5 text-[10px] leading-snug text-[#526078]">{c.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[#EFE4D3] bg-[#FFF8EF] px-4 py-2.5 text-[10px] text-[#526078]">
            <span>9 active deals · $2.2M pipeline value</span>
            <span className="font-medium text-[#173B7A]">Drag to move between stages</span>
          </div>
        </div>
      </div>
    </section>
  );
}

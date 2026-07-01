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
    <section className="py-20 bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center mb-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 mb-2">
            Live pipeline
          </p>
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-4xl">
            Every deal,{" "}
            <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text font-serif font-normal italic text-transparent">
              exactly where it stands.
            </span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Drag deals across stages, see days-in-stage timers, and never lose track of a buyer again.
          </p>
        </div>

        <div className="mx-auto max-w-6xl overflow-x-auto rounded-2xl border bg-card shadow-xl">
          <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-red-400/70" />
            <div className="h-3 w-3 rounded-full bg-yellow-400/70" />
            <div className="h-3 w-3 rounded-full bg-green-400/70" />
            <span className="ml-2 text-xs font-medium text-muted-foreground">
              Pipeline — Artisan Home Network
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] text-muted-foreground">live</span>
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
                    <div key={c.name} className="rounded-lg border bg-background p-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-semibold leading-tight">{c.name}</span>
                        <span className="shrink-0 text-[9px] text-muted-foreground">{c.time}</span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug">{c.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t bg-muted/20 px-4 py-2.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>9 active deals · $2.2M pipeline value</span>
            <span className="text-blue-500 font-medium">Drag to move between stages</span>
          </div>
        </div>
      </div>
    </section>
  );
}

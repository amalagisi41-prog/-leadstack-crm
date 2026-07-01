import { Bot, User } from "lucide-react";

const chatMessages = [
  {
    from: "visitor",
    text: "Hey, I saw your listing on Zillow — the 3BR in Maplewood. Is it still available?",
  },
  {
    from: "bot",
    text: "Hi Jennifer! Yes, 47 Elmwood Ave is still available. It was listed at $489,000 — 3 bed, 2 bath, newly renovated kitchen. Are you looking to schedule a showing?",
  },
  {
    from: "visitor",
    text: "Yes! This weekend if possible. Saturday afternoon?",
  },
  {
    from: "bot",
    text: "Saturday at 1pm or 3pm both work. Which do you prefer? I can also send you the full listing photos and disclosure docs right now.",
  },
  {
    from: "visitor",
    text: "1pm works! And yes please on the docs.",
  },
  {
    from: "bot",
    text: "Perfect, you're confirmed for Saturday at 1pm at 47 Elmwood Ave. I've sent the listing packet to your email. Marcus will meet you there — he'll reach out tomorrow to confirm. 🏡",
  },
];

export function AiDemo() {
  return (
    <section id="ai-demo" className="py-24 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary mb-2">
                AI receptionist
              </p>
              <h2 className="text-3xl font-semibold tracking-tighter sm:text-4xl mb-4">
                You can&apos;t answer every inquiry.{" "}
                <span className="font-serif font-normal italic">Your AI can.</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                LeadStack&apos;s AI receptionist responds to inbound texts, web chat, and calls 24/7 — qualifying buyers, booking showings, and sending listing docs before you even see the notification.
              </p>
              <ul className="space-y-3">
                {[
                  "Responds in under 60 seconds, day or night",
                  "Answers property questions using your listing data",
                  "Books showings directly into your calendar",
                  "Escalates hot leads to you immediately",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-600">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Chat mockup */}
            <div className="rounded-2xl border bg-card shadow-xl overflow-hidden">
              <div className="flex items-center gap-3 border-b px-4 py-3 bg-muted/30">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10">
                  <Bot className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold">Artisan Home Network</p>
                  <p className="text-[10px] text-muted-foreground">AI Receptionist · Online</p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[10px] text-muted-foreground">live</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 p-4 max-h-80 overflow-y-auto">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${msg.from === "visitor" ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${msg.from === "bot" ? "bg-blue-500/10" : "bg-blue-500/10"}`}>
                      {msg.from === "bot" ? (
                        <Bot className="h-3 w-3 text-blue-500" />
                      ) : (
                        <User className="h-3 w-3 text-blue-500" />
                      )}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        msg.from === "bot"
                          ? "bg-muted text-foreground"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t px-4 py-3 flex items-center gap-2">
                <div className="flex-1 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                  Type a message...
                </div>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold">
                  ↑
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

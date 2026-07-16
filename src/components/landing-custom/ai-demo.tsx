import { Bot, User } from "lucide-react";

const chatMessages = [
  {
    from: "visitor",
    text: "Hey, I saw your listing on Zillow — the 3BR in Maplewood. Is it still available?",
  },
  {
    from: "bot",
    text: "Hi Jennifer! Yes, 47 Elmwood Ave is still available at $489,000 — 3 bed, 2 bath, newly renovated kitchen. Are you looking to schedule a showing?",
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
    text: "Perfect — you're confirmed for Saturday at 1pm at 47 Elmwood Ave. I've sent the listing packet to your email. Marcus will meet you there! 🏡",
  },
];

export function AiDemo() {
  return (
    <section id="ai-demo" className="bg-[#FFF8EF] py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.28em] text-[#173B7A]">
                Never miss an inquiry
              </p>
              <h2 className="mb-4 text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
                Every lead answered.{" "}
                <span className="font-sans font-normal italic text-[#DB4F9B]">
                  Even at 2 a.m.
                </span>
              </h2>
              <p className="mb-6 max-w-xl leading-7 text-[#526078]">
                AgentStack responds to inbound texts, web chat, and calls around the clock — qualifying buyers, booking showings, and sending listing docs before you even see the notification.
              </p>
              <ul className="space-y-3">
                {[
                  "Responds in under 60 seconds, day or night",
                  "Answers property questions using your listing data",
                  "Books showings directly into your calendar",
                  "Escalates hot leads to you immediately",
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

            {/* Chat mockup */}
            <div className="overflow-hidden rounded-[1.75rem] border border-[#E7DCC7] bg-white shadow-[0_24px_70px_rgba(23,59,122,0.08)]">
              <div className="flex items-center gap-3 border-b border-[#EFE4D3] bg-[#FFF8EF] px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#173B7A]">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#173B7A]">AgentStack</p>
                  <p className="text-[10px] text-[#7B8AA1]">Powered by AgentStack AI · Online</p>
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#28C840]" />
                  <span className="text-[10px] text-[#7B8AA1]">live</span>
                </div>
              </div>

              <div className="flex max-h-72 flex-col gap-3 overflow-y-auto bg-[#FFFDFC] p-4">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 ${msg.from === "visitor" ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${msg.from === "bot" ? "bg-[#173B7A]/10" : "bg-[#173B7A]"}`}>
                      {msg.from === "bot" ? (
                        <Bot className="h-3 w-3 text-[#173B7A]" />
                      ) : (
                        <User className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                        msg.from === "bot"
                          ? "bg-[#FFF8EF] text-[#173B7A]"
                          : "bg-[#173B7A] text-white"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 border-t border-[#EFE4D3] bg-[#FFF8EF] px-4 py-3">
                <div className="flex-1 rounded-lg border border-[#E7DCC7] bg-white px-3 py-1.5 text-xs text-[#7B8AA1]">
                  Type a message...
                </div>
                <div className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-[#173B7A] text-sm font-bold text-white transition-colors hover:bg-[#214b95]">
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

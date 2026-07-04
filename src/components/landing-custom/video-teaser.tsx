"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const SLIDES = [
  {
    bg: "deep",
    duration: 9,
    content: (
      <>
        <p className="vt-kicker">While you were in a showing…</p>
        <h2 className="vt-h1">
          You just missed a <span className="vt-accent">$12,000</span>{" "}
          commission.
        </h2>
        <p className="vt-sub">
          A Zillow lead texted. Waited 11 minutes. Then called the next agent on
          the list.
        </p>
      </>
    ),
  },
  {
    bg: "cream",
    duration: 8,
    content: (
      <>
        <p className="vt-bignum">78%</p>
        <h2 className="vt-h1 vt-h1-sm">
          of buyers hire the <span className="vt-accent">first agent</span> who
          responds.
        </h2>
        <p className="vt-sub">
          Speed isn&apos;t a nice-to-have. It&apos;s the whole game.
        </p>
      </>
    ),
  },
  {
    bg: "deep",
    duration: 10,
    content: (
      <>
        <span className="vt-pulse">
          <span className="vt-pulse-dot" />
          Introducing
        </span>
        <div className="vt-lockup">
          <p className="vt-wordmark">
            Agent<span className="vt-accent">Stack</span>
          </p>
          <p className="vt-lock-tag">Real Estate Solutions</p>
        </div>
        <p className="vt-sub">
          The AI-powered CRM that answers, qualifies, and books — so you never
          lose another deal between showings.
        </p>
      </>
    ),
  },
  {
    bg: "blue",
    duration: 14,
    content: (
      <>
        <p className="vt-kicker" style={{ opacity: 0.85 }}>
          Your 24/7 AI receptionist
        </p>
        <h2 className="vt-h1 vt-h1-md">
          Every lead answered in{" "}
          <span style={{ color: "var(--vt-deep)" }}>under 60 seconds.</span>
        </h2>
        <div className="vt-phone">
          <div className="vt-ph-head">
            <div className="vt-ph-dot">AI</div>
            <div>
              <p className="vt-ph-name">Rivera Realty Group</p>
              <p className="vt-ph-ai">● AgentStack AI · replies instantly</p>
            </div>
          </div>
          <div className="vt-bub vt-bub-lead">
            Hi — is 42 Birchwood Ln still available? We&apos;re pre-approved at
            $900k.
          </div>
          <p className="vt-stamp">Sat 9:42 PM</p>
          <div className="vt-bub vt-bub-ai">
            It is! Great news on the pre-approval. Sarah has Sunday 1:30 or 3:00
            open for a private showing — which works better?
          </div>
          <p className="vt-stamp vt-stamp-r">
            Sat 9:42 PM · 38 seconds later
          </p>
          <div className="vt-bub vt-bub-lead">1:30 works!</div>
          <div className="vt-bub vt-bub-ai">
            Booked ✓ You&apos;ll get a confirmation text shortly. See you
            Sunday!
          </div>
        </div>
      </>
    ),
  },
  {
    bg: "cream",
    duration: 10,
    content: (
      <>
        <p className="vt-kicker">Nothing falls through the cracks</p>
        <h2 className="vt-h1 vt-h1-sm">
          Every deal tracked from{" "}
          <span className="vt-accent">inquiry to closing day.</span>
        </h2>
        <div className="vt-chips">
          {[
            "New Inquiry",
            "Showing Scheduled",
            "Offer Submitted",
            "Under Contract",
          ].map((s) => (
            <span key={s} className="vt-chip vt-chip-light">
              {s}
            </span>
          ))}
          <span className="vt-chip vt-chip-active">Closed ✓</span>
        </div>
        <p className="vt-sub">
          Automatic follow-ups, deadline reminders, and pre-approval tracking on
          every card.
        </p>
      </>
    ),
  },
  {
    bg: "deep",
    duration: 9,
    content: (
      <>
        <p className="vt-kicker">Get your evenings back</p>
        <p className="vt-bignum">5+ hrs</p>
        <h2 className="vt-h1 vt-h1-sm">
          saved every week on{" "}
          <span className="vt-accent">
            follow-up, scheduling &amp; reviews.
          </span>
        </h2>
      </>
    ),
  },
  {
    bg: "blue",
    duration: 11,
    content: (
      <>
        <p className="vt-kicker" style={{ opacity: 0.85 }}>
          What speed is worth
        </p>
        <h2 className="vt-h1 vt-h1-md">2–3 extra closings a year.</h2>
        <div className="vt-vals">
          <div className="vt-val">
            <p className="vt-val-n">
              <em>2.3x</em>
            </p>
            <p className="vt-val-l">More leads contacted same-day</p>
          </div>
          <div className="vt-val">
            <p className="vt-val-n">
              $48k<em>+</em>
            </p>
            <p className="vt-val-l">Added GCI per year</p>
          </div>
          <div className="vt-val">
            <p className="vt-val-n">
              <em>38s</em>
            </p>
            <p className="vt-val-l">Avg response time</p>
          </div>
        </div>
      </>
    ),
  },
  {
    bg: "deep",
    duration: 11,
    content: (
      <>
        <p className="vt-kicker">Everything in one stack</p>
        <h2 className="vt-h1 vt-h1-md">
          Built for REALTORS®,{" "}
          <span className="vt-accent">not spreadsheets.</span>
        </h2>
        <div className="vt-chips">
          {[
            { e: "🤖", t: "AI Receptionist" },
            { e: "⬡", t: "Deal Pipeline" },
            { e: "📅", t: "Showing Scheduler" },
            { e: "📍", t: "Territory Routing" },
            { e: "⭐", t: "Review Engine" },
            { e: "📊", t: "GCI Analytics" },
          ].map((c) => (
            <span key={c.t} className="vt-chip">
              <em>{c.e}</em> {c.t}
            </span>
          ))}
        </div>
      </>
    ),
  },
  {
    bg: "deep",
    duration: 8,
    content: (
      <>
        <div className="vt-lockup">
          <p className="vt-wordmark vt-wordmark-sm">
            Agent<span className="vt-accent">Stack</span>
          </p>
          <p className="vt-lock-tag">Real Estate Solutions</p>
        </div>
        <p className="vt-sub">Stop losing deals between showings.</p>
        <a href="/signup" className="vt-cta-btn">
          Start Free — 14 Days
        </a>
        <p className="vt-url">agentstacksolutions.com</p>
      </>
    ),
  },
] as const;

const TOTAL = SLIDES.reduce((a, s) => a + s.duration, 0);

export function VideoTeaser() {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const elapsed = useRef(0);
  const inSlide = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const go = useCallback((i: number) => {
    const next = Math.max(0, Math.min(SLIDES.length - 1, i));
    setIdx(next);
    inSlide.current = 0;
    elapsed.current = SLIDES.slice(0, next).reduce((a, s) => a + s.duration, 0);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      elapsed.current += 0.1;
      inSlide.current += 0.1;
      if (inSlide.current >= SLIDES[idx].duration) {
        if (idx < SLIDES.length - 1) {
          setIdx((i) => i + 1);
          inSlide.current = 0;
        } else {
          setPlaying(false);
        }
      }
    }, 100);
    return () => clearInterval(iv);
  }, [playing, idx]);

  useEffect(() => {
    if (!playing || !containerRef.current) return;
    const bar = containerRef.current.querySelector<HTMLDivElement>(".vt-bar-fill");
    const clock = containerRef.current.querySelector<HTMLSpanElement>(".vt-clock");
    const iv = setInterval(() => {
      if (bar) bar.style.width = `${(elapsed.current / TOTAL) * 100}%`;
      if (clock) {
        const t = Math.min(TOTAL, Math.floor(elapsed.current));
        clock.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      }
    }, 100);
    return () => clearInterval(iv);
  }, [playing]);

  const handlePlayPause = () => {
    if (!hasStarted) {
      setHasStarted(true);
      setPlaying(true);
      return;
    }
    if (!playing && idx === SLIDES.length - 1 && inSlide.current >= SLIDES[idx].duration) {
      go(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  const bgClass =
    SLIDES[idx].bg === "cream"
      ? "vt-bg-cream"
      : SLIDES[idx].bg === "blue"
        ? "vt-bg-blue"
        : "vt-bg-deep";

  return (
    <section id="video-teaser" className="scroll-mt-8 py-16 md:py-24 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center mb-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-500 mb-3">
            See it in action
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Watch the AgentStack difference
          </h2>
          <p className="mt-3 text-muted-foreground">
            See how AgentStack turns missed leads into closed deals — in under
            90 seconds.
          </p>
        </div>

        <div
          ref={containerRef}
          className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl border shadow-2xl"
        >
          {/* Progress bar */}
          <div className="absolute top-0 left-0 right-0 z-20 h-1 bg-white/10">
            <div
              className="vt-bar-fill h-full bg-[#3b7ff2] transition-[width] duration-100"
              style={{ width: "0%" }}
            />
          </div>

          {/* Slide viewport */}
          <div className={`vt-viewport ${bgClass}`}>
            {/* Play overlay (before start) */}
            {!hasStarted && (
              <button
                onClick={handlePlayPause}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#122a55]/90 transition-opacity hover:bg-[#122a55]/80"
                aria-label="Play teaser"
              >
                <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 backdrop-blur-sm">
                  <svg
                    className="ml-1 h-8 w-8 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span className="text-sm font-semibold text-white/70">
                  Play teaser · {Math.floor(TOTAL / 60)}:{String(TOTAL % 60).padStart(2, "0")}
                </span>
              </button>
            )}

            {/* Slides */}
            {SLIDES.map((slide, i) => (
              <div
                key={i}
                className={`vt-slide ${i === idx && hasStarted ? "vt-slide-active" : ""}`}
              >
                {slide.content}
              </div>
            ))}
          </div>

          {/* Controls */}
          {hasStarted && (
            <div className="vt-hud">
              <span className="vt-clock">0:00</span>
              <button
                className="vt-hud-btn"
                onClick={() => go(idx - 1)}
                disabled={idx === 0}
              >
                ‹ Back
              </button>
              <button className="vt-hud-btn" onClick={handlePlayPause}>
                {!playing && idx === SLIDES.length - 1
                  ? "Replay"
                  : playing
                    ? "Pause"
                    : "Play"}
              </button>
              <button
                className="vt-hud-btn"
                onClick={() => go(idx + 1)}
                disabled={idx === SLIDES.length - 1}
              >
                Next ›
              </button>
              <div className="flex gap-1.5">
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    className={`h-2 w-2 rounded-full transition-colors ${i === idx ? "bg-[#6ba3ff]" : "bg-white/30"}`}
                    onClick={() => go(i)}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scoped styles */}
      <style>{`
        :root {
          --vt-cream: #f5f0e8;
          --vt-navy: #1b3d7a;
          --vt-deep: #122a55;
          --vt-blue: #3b7ff2;
          --vt-sky: #6ba3ff;
        }

        .vt-viewport {
          position: relative;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          transition: background 0.5s ease;
        }
        @media (max-width: 640px) {
          .vt-viewport { aspect-ratio: 4 / 3; }
        }

        .vt-bg-deep { background: radial-gradient(1200px 700px at 50% 30%, #1b3d7a 0%, #122a55 65%); }
        .vt-bg-cream { background: #f5f0e8; }
        .vt-bg-blue { background: linear-gradient(150deg, #2d63c8 0%, #3b7ff2 60%, #6ba3ff 100%); }

        .vt-slide {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 32px 6vw 64px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.5s ease;
        }
        .vt-slide-active { opacity: 1; pointer-events: auto; }

        .vt-slide > * { opacity: 0; transform: translateY(20px); }
        .vt-slide-active > * { animation: vtUp 0.7s cubic-bezier(0.22,1,0.36,1) forwards; }
        .vt-slide-active > *:nth-child(1) { animation-delay: 0.05s; }
        .vt-slide-active > *:nth-child(2) { animation-delay: 0.2s; }
        .vt-slide-active > *:nth-child(3) { animation-delay: 0.38s; }
        .vt-slide-active > *:nth-child(4) { animation-delay: 0.56s; }
        .vt-slide-active > *:nth-child(5) { animation-delay: 0.74s; }
        .vt-slide-active > *:nth-child(6) { animation-delay: 0.9s; }
        @keyframes vtUp { to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .vt-slide > *, .vt-slide-active > * { animation: none !important; opacity: 1; transform: none; }
        }

        .vt-kicker {
          font-size: clamp(10px, 1.3vw, 13px);
          font-weight: 800;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          opacity: 0.65;
          margin-bottom: 20px;
          color: var(--vt-cream);
        }
        .vt-bg-cream .vt-kicker { color: var(--vt-navy); }
        .vt-bg-blue .vt-kicker { color: #fff; }

        .vt-h1 {
          font-size: clamp(24px, 5vw, 60px);
          font-weight: 900;
          letter-spacing: -0.03em;
          line-height: 1.05;
          max-width: 14ch;
          text-wrap: balance;
          color: var(--vt-cream);
          margin: 0;
        }
        .vt-h1-sm { font-size: clamp(20px, 3.2vw, 38px); }
        .vt-h1-md { font-size: clamp(22px, 3.8vw, 46px); }
        .vt-bg-cream .vt-h1 { color: var(--vt-navy); }
        .vt-bg-blue .vt-h1 { color: #fff; }

        .vt-accent { color: var(--vt-sky); }
        .vt-bg-cream .vt-accent { color: var(--vt-blue); }

        .vt-sub {
          font-size: clamp(13px, 1.6vw, 18px);
          font-weight: 600;
          opacity: 0.75;
          margin-top: 18px;
          max-width: 42ch;
          line-height: 1.5;
          color: var(--vt-cream);
        }
        .vt-bg-cream .vt-sub { color: var(--vt-navy); }
        .vt-bg-blue .vt-sub { color: #fff; }

        .vt-bignum {
          font-size: clamp(50px, 11vw, 140px);
          font-weight: 900;
          letter-spacing: -0.04em;
          line-height: 0.95;
          color: var(--vt-sky);
          font-variant-numeric: tabular-nums;
          margin: 0 0 10px;
        }
        .vt-bg-cream .vt-bignum { color: var(--vt-blue); }

        .vt-lockup { line-height: 1; }
        .vt-wordmark {
          font-size: clamp(36px, 7vw, 80px);
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--vt-cream);
          margin: 0;
        }
        .vt-wordmark-sm { font-size: clamp(32px, 5.5vw, 64px); }
        .vt-lock-tag {
          font-size: clamp(10px, 1.3vw, 15px);
          font-weight: 700;
          letter-spacing: 0.36em;
          text-transform: uppercase;
          color: rgba(245,240,232,0.6);
          margin-top: 12px;
        }

        .vt-pulse {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          background: rgba(107,163,255,0.14);
          border: 1px solid rgba(107,163,255,0.4);
          color: var(--vt-sky);
          font-size: clamp(11px, 1.3vw, 14px);
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 8px 18px;
          border-radius: 24px;
          margin-bottom: 24px;
        }
        .vt-pulse-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--vt-sky);
          animation: vtPulse 1.6s infinite;
        }
        @keyframes vtPulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }

        .vt-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: center;
          max-width: 680px;
          margin-top: 28px;
        }
        .vt-chip {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 12px;
          padding: 10px 16px;
          font-size: clamp(11px, 1.3vw, 14px);
          font-weight: 700;
          color: var(--vt-cream);
        }
        .vt-chip em { font-style: normal; color: var(--vt-sky); margin-right: 4px; }
        .vt-chip-light {
          background: #fff;
          border-color: #e2dcd0;
          color: var(--vt-navy);
        }
        .vt-chip-active {
          background: var(--vt-blue);
          border-color: var(--vt-blue);
          color: #fff;
          padding: 10px 16px;
          border-radius: 12px;
          font-size: clamp(11px, 1.3vw, 14px);
          font-weight: 700;
        }

        .vt-vals {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 28px;
        }
        .vt-val {
          background: #fff;
          border-radius: 14px;
          padding: 20px 26px;
          min-width: 150px;
          box-shadow: 0 10px 32px rgba(18,42,85,0.18);
        }
        .vt-val-n {
          font-size: clamp(22px, 3.6vw, 40px);
          font-weight: 900;
          letter-spacing: -0.03em;
          color: var(--vt-navy);
          font-variant-numeric: tabular-nums;
          margin: 0;
        }
        .vt-val-n em { font-style: normal; color: var(--vt-blue); }
        .vt-val-l {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(27,61,122,0.5);
          margin-top: 6px;
        }

        .vt-phone {
          background: #fff;
          border-radius: 18px;
          padding: 16px;
          width: min(360px, 80%);
          box-shadow: 0 18px 50px rgba(0,0,0,0.35);
          text-align: left;
          margin-top: 24px;
        }
        .vt-ph-head {
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #e8e4dc;
          padding-bottom: 12px;
          margin-bottom: 12px;
        }
        .vt-ph-dot {
          width: 32px; height: 32px;
          border-radius: 50%;
          background: var(--vt-blue);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-weight: 900;
          font-size: 12px;
          flex-shrink: 0;
        }
        .vt-ph-name { font-weight: 800; color: var(--vt-navy); font-size: 13px; }
        .vt-ph-ai { font-size: 10px; color: var(--vt-blue); font-weight: 700; }

        .vt-bub {
          max-width: 82%;
          padding: 9px 13px;
          border-radius: 12px;
          font-size: 12px;
          line-height: 1.45;
          margin-bottom: 7px;
        }
        .vt-bub-lead { background: #eef1f6; color: #222; border-bottom-left-radius: 4px; }
        .vt-bub-ai { background: var(--vt-blue); color: #fff; margin-left: auto; border-bottom-right-radius: 4px; }
        .vt-stamp { font-size: 10px; color: #9aa2b1; margin: 2px 6px 8px; }
        .vt-stamp-r { text-align: right; }

        .vt-cta-btn {
          display: inline-block;
          background: var(--vt-blue);
          color: #fff;
          font-weight: 800;
          font-size: clamp(14px, 1.6vw, 18px);
          padding: 14px 36px;
          border-radius: 12px;
          margin-top: 28px;
          box-shadow: 0 12px 36px rgba(59,127,242,0.45);
          text-decoration: none;
        }
        .vt-cta-btn:hover { filter: brightness(1.08); }
        .vt-url {
          font-size: clamp(12px, 1.4vw, 16px);
          font-weight: 700;
          letter-spacing: 0.08em;
          color: rgba(245,240,232,0.55);
          margin-top: 16px;
        }

        .vt-hud {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 12px 16px;
          background: linear-gradient(transparent, rgba(10,20,42,0.7));
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 20;
        }
        .vt-hud-btn {
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.22);
          color: #fff;
          font-weight: 700;
          font-size: 12px;
          padding: 6px 14px;
          border-radius: 8px;
          cursor: pointer;
        }
        .vt-hud-btn:hover { background: rgba(255,255,255,0.22); }
        .vt-hud-btn:disabled { opacity: 0.4; cursor: default; }
        .vt-clock {
          font-size: 11px;
          font-weight: 700;
          color: rgba(255,255,255,0.6);
          font-variant-numeric: tabular-nums;
          min-width: 36px;
        }
      `}</style>
    </section>
  );
}

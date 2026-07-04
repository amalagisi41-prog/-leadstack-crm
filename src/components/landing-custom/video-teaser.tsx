"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const SLIDES = [
  {
    bg: "light",
    duration: 8,
    content: (
      <>
        <div className="vt-hero-grid">
          <div>
            <p className="vt-wordmark">
              <span className="vt-wm-a">Agent</span>
              <span className="vt-wm-s">Stack</span>
            </p>
            <p className="vt-hero-sub">
              The business operating system for modern real estate.
            </p>
          </div>
          <div className="vt-dash-mock">
            <div className="vt-dash-bar">
              <span className="vt-dash-dot" />
              <span className="vt-dash-dot" />
              <span className="vt-dash-dot" />
            </div>
            <div className="vt-dash-body">
              <div className="vt-dash-sidebar">
                {["Dashboard", "Contacts", "Pipeline", "Calendar", "AI Agent"].map(
                  (t) => (
                    <span key={t} className="vt-dash-nav">
                      {t}
                    </span>
                  ),
                )}
              </div>
              <div className="vt-dash-main">
                <div className="vt-dash-kpi">
                  <div>
                    <span className="vt-kpi-n">24</span>
                    <span className="vt-kpi-l">Active Leads</span>
                  </div>
                  <div>
                    <span className="vt-kpi-n">8</span>
                    <span className="vt-kpi-l">Showings</span>
                  </div>
                  <div>
                    <span className="vt-kpi-n">3</span>
                    <span className="vt-kpi-l">Offers</span>
                  </div>
                </div>
                <div className="vt-dash-chart" />
              </div>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    bg: "light",
    duration: 7,
    content: (
      <>
        <p className="vt-small">New Buyer Inquiry</p>
        <div className="vt-notice">
          <p className="vt-notice-title">Sarah Thompson</p>
          <p className="vt-notice-body">
            &ldquo;I&apos;d like to schedule a showing.&rdquo;
          </p>
          <div className="vt-pill">
            <span className="vt-pill-dot" />
            Showing starts in 5 minutes
          </div>
        </div>
        <p className="vt-muted-hint">
          You&apos;re in a showing. But the lead can&apos;t wait.
        </p>
      </>
    ),
  },
  {
    bg: "blue",
    duration: 10,
    content: (
      <>
        <div className="vt-ai-grid">
          <div className="vt-ai-left">
            <p className="vt-small vt-small-blue">Automation</p>
            <h2 className="vt-h2 vt-h2-navy">AI Receptionist</h2>
            <p className="vt-ai-desc">
              Instantly responds, confirms the request, and keeps you focused.
            </p>
          </div>
          <div className="vt-chat">
            <div className="vt-bub vt-bub-lead">
              Sarah: I&apos;d like to schedule a showing.
            </div>
            <div className="vt-bub vt-bub-ai vt-typing">
              <span />
              <span />
              <span />
            </div>
            <div className="vt-bub vt-bub-ai">
              <strong>Appointment Confirmed</strong>{" "}
              <span className="vt-check">✓</span>
              <br />
              <span className="vt-bub-muted">
                Showing window sent to Sarah.
              </span>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    bg: "light",
    duration: 9,
    content: (
      <>
        <p className="vt-small">Pipeline</p>
        <h2 className="vt-h2">Lead Journey</h2>
        <div className="vt-timeline-card">
          <div className="vt-tl-track">
            <div className="vt-tl-fill" />
          </div>
          <div className="vt-milestones">
            {[
              { label: "New Lead", done: true },
              { label: "Showing", done: true },
              { label: "Offer", done: true },
              { label: "Contract", done: false },
              { label: "Closed", done: false },
            ].map((m) => (
              <div
                key={m.label}
                className={`vt-ms ${m.done ? "vt-ms-done" : ""}`}
              >
                <div className="vt-ms-dot" />
                {m.label}
              </div>
            ))}
          </div>
        </div>
      </>
    ),
  },
  {
    bg: "dark",
    duration: 9,
    content: (
      <>
        <div className="vt-bp-grid">
          <div>
            <p className="vt-small vt-small-dark">Onboarding</p>
            <h2 className="vt-h2 vt-h2-white">Business Blueprint</h2>
            <p className="vt-bp-desc">
              Build your operating system once. Let AgentStack apply it
              everywhere.
            </p>
          </div>
          <div className="vt-checklist-card">
            {[
              "Business Profile",
              "Service Areas",
              "Lead Sources",
              "Follow-Up Rules",
              "AI Receptionist",
              "Integrations",
            ].map((item) => (
              <div key={item} className="vt-row">
                <span className="vt-box">✓</span>
                {item}
              </div>
            ))}
            <div className="vt-pill vt-pill-sm">Blueprint Complete</div>
          </div>
        </div>
      </>
    ),
  },
  {
    bg: "light",
    duration: 8,
    content: (
      <>
        <div className="vt-import-grid">
          <div>
            <p className="vt-small">Import</p>
            <h2 className="vt-h2">Contact Import</h2>
            <p className="vt-ai-desc">
              Existing contacts organized. Duplicates removed. Ready.
            </p>
          </div>
          <div className="vt-import-card">
            <div className="vt-metrics">
              <div className="vt-metric">
                <span className="vt-metric-n">1,248</span>
                <span className="vt-metric-l">Contacts Imported</span>
              </div>
              <div className="vt-metric">
                <span className="vt-metric-n">99%</span>
                <span className="vt-metric-l">Data Accuracy</span>
              </div>
            </div>
            <div className="vt-bars">
              {[
                { label: "Buyers", pct: 84 },
                { label: "Sellers", pct: 72 },
                { label: "Investors", pct: 48 },
                { label: "Past Clients", pct: 91 },
              ].map((b) => (
                <div key={b.label} className="vt-bar-row">
                  <div className="vt-bar-label">
                    <span>{b.label}</span>
                    <span>{b.pct}%</span>
                  </div>
                  <div className="vt-bar-track">
                    <div
                      className="vt-bar-fill-h"
                      style={{ width: `${b.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    bg: "blue",
    duration: 8,
    content: (
      <>
        <p className="vt-small vt-small-blue">Connected</p>
        <h2 className="vt-h2 vt-h2-navy">Connect Your Business</h2>
        <div className="vt-integrations">
          {[
            { icon: "✉", label: "Email" },
            { icon: "📅", label: "Calendar" },
            { icon: "🌐", label: "Website" },
            { icon: "📱", label: "Phone" },
            { icon: "⭐", label: "Google Business" },
          ].map((i) => (
            <div key={i.label} className="vt-integ">
              <span className="vt-integ-icon">{i.icon}</span>
              <span className="vt-integ-label">{i.label}</span>
              <span className="vt-check-sm">✓</span>
            </div>
          ))}
        </div>
      </>
    ),
  },
  {
    bg: "light",
    duration: 9,
    content: (
      <>
        <div className="vt-plan-grid">
          <div className="vt-plan-left">
            <p className="vt-small">Daily Plan</p>
            <h2 className="vt-h2">Today&apos;s Plan</h2>
            <p className="vt-ai-desc">
              Good morning. Here&apos;s what moves the business forward.
            </p>
            <div className="vt-todos">
              {["Call Sarah Thompson", "Confirm showing at 2pm", "Review 3 new leads"].map(
                (t) => (
                  <div key={t} className="vt-todo">
                    <span className="vt-todo-dot" />
                    {t}
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="vt-nba-card">
            <p className="vt-small">Next Best Action</p>
            <p className="vt-nba-title">
              Confirm Sarah&apos;s showing window
            </p>
            <span className="vt-check-lg">✓</span>
          </div>
        </div>
      </>
    ),
  },
  {
    bg: "light",
    duration: 7,
    content: (
      <>
        <h2 className="vt-cta-h">
          Build your business once.
          <br />
          Let AgentStack handle the rest.
        </h2>
        <a href="/signup" className="vt-cta-btn">
          Start Free — 14 Days
        </a>
        <p className="vt-cta-url">agentstackcrm.app</p>
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
    elapsed.current = SLIDES.slice(0, next).reduce(
      (a, s) => a + s.duration,
      0,
    );
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
    const bar =
      containerRef.current.querySelector<HTMLDivElement>(".vt-prog-fill");
    const clock =
      containerRef.current.querySelector<HTMLSpanElement>(".vt-clock");
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
    if (
      !playing &&
      idx === SLIDES.length - 1 &&
      inSlide.current >= SLIDES[idx].duration
    ) {
      go(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  const bgClass =
    SLIDES[idx].bg === "blue"
      ? "vt-bg-blue"
      : SLIDES[idx].bg === "dark"
        ? "vt-bg-dark"
        : "vt-bg-light";

  return (
    <section
      id="video-teaser"
      className="scroll-mt-8 py-16 md:py-24 bg-gradient-to-b from-background to-muted/30"
    >
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
          <div className="absolute top-0 left-0 right-0 z-20 h-1 bg-black/5">
            <div
              className="vt-prog-fill h-full bg-[#3B82F6] transition-[width] duration-100"
              style={{ width: "0%" }}
            />
          </div>

          {/* Slide viewport */}
          <div className={`vt-viewport ${bgClass}`}>
            {!hasStarted && (
              <button
                onClick={handlePlayPause}
                className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#0E1117]/80 transition-opacity hover:bg-[#0E1117]/70"
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
                  Play teaser · {Math.floor(TOTAL / 60)}:
                  {String(TOTAL % 60).padStart(2, "0")}
                </span>
              </button>
            )}

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
                    className={`h-2 w-2 rounded-full transition-colors ${i === idx ? "bg-[#3B82F6]" : "bg-black/20"}`}
                    onClick={() => go(i)}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        :root {
          --vt-bg: #F8F8F6;
          --vt-navy: #173B7A;
          --vt-blue: #3B82F6;
          --vt-muted: #6B7280;
          --vt-border: #E8E9ED;
          --vt-tint: #EFF6FF;
          --vt-card: #FFFFFF;
          --vt-text: #171717;
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

        .vt-bg-light { background: var(--vt-bg); }
        .vt-bg-blue { background: var(--vt-tint); }
        .vt-bg-dark { background: #0E1117; }

        /* --- Slide transitions --- */
        .vt-slide {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 6vw 64px;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.5s ease;
        }
        .vt-slide-active { opacity: 1; pointer-events: auto; }

        .vt-slide > * { opacity: 0; transform: translateY(16px); }
        .vt-slide-active > * { animation: vtUp 0.6s cubic-bezier(0.22,1,0.36,1) forwards; }
        .vt-slide-active > *:nth-child(1) { animation-delay: 0.05s; }
        .vt-slide-active > *:nth-child(2) { animation-delay: 0.18s; }
        .vt-slide-active > *:nth-child(3) { animation-delay: 0.32s; }
        .vt-slide-active > *:nth-child(4) { animation-delay: 0.46s; }
        @keyframes vtUp { to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .vt-slide > *, .vt-slide-active > * { animation: none !important; opacity: 1; transform: none; }
        }

        /* --- Typography --- */
        .vt-small {
          font-size: clamp(10px, 1.2vw, 14px);
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--vt-muted);
          margin-bottom: 10px;
        }
        .vt-small-blue { color: var(--vt-navy); }
        .vt-small-dark { color: rgba(255,255,255,0.5); }

        .vt-h2 {
          font-size: clamp(24px, 4.5vw, 52px);
          font-weight: 800;
          letter-spacing: -0.045em;
          line-height: 1.02;
          color: var(--vt-text);
          margin: 0 0 14px;
        }
        .vt-h2-white { color: #fff; }
        .vt-h2-navy { color: var(--vt-navy); }

        /* --- Slide 1: Hero --- */
        .vt-hero-grid {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 28px;
          width: 100%;
          height: 100%;
          align-items: center;
          text-align: left;
        }
        @media (max-width: 640px) { .vt-hero-grid { grid-template-columns: 1fr; } }

        .vt-wordmark {
          font-size: clamp(32px, 6vw, 76px);
          font-weight: 800;
          letter-spacing: -0.055em;
          line-height: 1;
          margin: 0;
        }
        .vt-wm-a { color: var(--vt-navy); }
        .vt-wm-s { color: var(--vt-blue); }
        .vt-hero-sub {
          font-size: clamp(14px, 2vw, 26px);
          color: var(--vt-muted);
          margin-top: 16px;
          line-height: 1.4;
          max-width: 520px;
        }

        .vt-dash-mock {
          background: var(--vt-card);
          border-radius: 14px;
          border: 1px solid var(--vt-border);
          box-shadow: 0 18px 50px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .vt-dash-bar {
          display: flex;
          gap: 5px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--vt-border);
        }
        .vt-dash-dot {
          width: 8px; height: 8px; border-radius: 50%; background: #D1D5DB;
        }
        .vt-dash-body { display: flex; min-height: 120px; }
        .vt-dash-sidebar {
          width: 30%;
          border-right: 1px solid var(--vt-border);
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .vt-dash-nav {
          font-size: clamp(7px, 0.9vw, 11px);
          padding: 4px 6px;
          border-radius: 4px;
          color: var(--vt-muted);
          font-weight: 600;
        }
        .vt-dash-nav:first-child { background: var(--vt-tint); color: var(--vt-navy); }
        .vt-dash-main { flex: 1; padding: 10px; }
        .vt-dash-kpi { display: flex; gap: 8px; margin-bottom: 10px; }
        .vt-kpi-n {
          display: block;
          font-size: clamp(14px, 2.2vw, 28px);
          font-weight: 800;
          color: var(--vt-navy);
          letter-spacing: -0.03em;
        }
        .vt-kpi-l {
          display: block;
          font-size: clamp(6px, 0.7vw, 9px);
          color: var(--vt-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .vt-dash-chart {
          height: 40px;
          border-radius: 6px;
          background: linear-gradient(90deg, var(--vt-tint) 0%, rgba(59,130,246,0.15) 100%);
        }

        /* --- Slide 2: Notification --- */
        .vt-notice {
          background: var(--vt-card);
          border: 1px solid var(--vt-border);
          border-radius: 18px;
          padding: clamp(16px, 3vw, 28px);
          box-shadow: 0 18px 50px rgba(0,0,0,0.1);
          max-width: 420px;
          width: 90%;
          text-align: left;
        }
        .vt-notice-title {
          font-size: clamp(18px, 2.5vw, 26px);
          font-weight: 800;
          color: var(--vt-navy);
          letter-spacing: -0.03em;
          margin: 0 0 8px;
        }
        .vt-notice-body {
          font-size: clamp(13px, 1.5vw, 18px);
          color: var(--vt-muted);
          margin: 0;
          line-height: 1.4;
        }
        .vt-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          border-radius: 99px;
          background: var(--vt-tint);
          color: var(--vt-navy);
          font-weight: 700;
          font-size: clamp(10px, 1.1vw, 14px);
          margin-top: 14px;
        }
        .vt-pill-sm { margin-top: 10px; }
        .vt-pill-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: var(--vt-blue);
          animation: vtPulse 1.6s infinite;
        }
        @keyframes vtPulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.7); }
        }
        .vt-muted-hint {
          font-size: clamp(12px, 1.3vw, 16px);
          color: var(--vt-muted);
          margin-top: 18px;
          font-weight: 600;
          opacity: 0.7;
        }

        /* --- Slide 3: AI chat --- */
        .vt-ai-grid {
          display: grid;
          grid-template-columns: 1fr 1.1fr;
          gap: 28px;
          width: 100%;
          height: 100%;
          align-items: center;
          text-align: left;
        }
        @media (max-width: 640px) { .vt-ai-grid { grid-template-columns: 1fr; } }

        .vt-ai-desc, .vt-bp-desc {
          font-size: clamp(12px, 1.4vw, 18px);
          color: var(--vt-muted);
          line-height: 1.45;
          max-width: 400px;
          margin: 0;
        }
        .vt-bp-desc { color: rgba(255,255,255,0.6); }
        .vt-ai-left .vt-h2 { margin-bottom: 10px; }

        .vt-chat {
          display: grid;
          gap: 10px;
        }
        .vt-bub {
          padding: 12px 16px;
          border-radius: 14px;
          font-size: clamp(11px, 1.2vw, 16px);
          line-height: 1.4;
          max-width: 88%;
        }
        .vt-bub-lead {
          background: #F5F7FB;
          border: 1px solid var(--vt-border);
          color: #333;
          justify-self: start;
          text-align: left;
        }
        .vt-bub-ai {
          background: var(--vt-card);
          border: 1px solid var(--vt-border);
          box-shadow: 0 8px 24px rgba(0,0,0,0.06);
          text-align: left;
          justify-self: end;
        }
        .vt-bub-muted { color: var(--vt-muted); font-size: 0.85em; }
        .vt-check { color: var(--vt-blue); font-weight: 900; }
        .vt-check-sm { color: var(--vt-blue); font-weight: 800; font-size: 12px; }
        .vt-check-lg {
          font-size: clamp(22px, 3vw, 36px);
          color: var(--vt-blue);
          font-weight: 900;
        }

        .vt-typing {
          display: flex !important;
          align-items: center;
          gap: 0;
          padding: 14px 18px;
        }
        .vt-typing span {
          width: 7px; height: 7px; border-radius: 50%;
          background: #C6CDD8;
          margin-right: 5px;
          animation: vtTyp 1.2s infinite;
        }
        .vt-typing span:nth-child(2) { animation-delay: 0.2s; }
        .vt-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes vtTyp { 50% { opacity: 0.35; transform: translateY(-2px); } }

        /* --- Slide 4: Pipeline --- */
        .vt-timeline-card {
          background: var(--vt-card);
          border: 1px solid var(--vt-border);
          border-radius: 18px;
          padding: clamp(24px, 4vw, 48px) clamp(16px, 3vw, 32px);
          box-shadow: 0 18px 50px rgba(0,0,0,0.08);
          width: 90%;
          max-width: 680px;
        }
        .vt-tl-track {
          height: 4px;
          border-radius: 99px;
          background: #DCE8FF;
          position: relative;
          margin-bottom: 20px;
        }
        .vt-tl-fill {
          position: absolute;
          left: 0; top: 0;
          height: 100%; width: 60%;
          border-radius: 99px;
          background: var(--vt-blue);
        }
        .vt-milestones {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }
        .vt-ms {
          text-align: center;
          color: var(--vt-muted);
          font-weight: 700;
          font-size: clamp(9px, 1.1vw, 14px);
        }
        .vt-ms-dot {
          width: clamp(16px, 2.2vw, 26px);
          height: clamp(16px, 2.2vw, 26px);
          background: var(--vt-card);
          border: 4px solid #DCE8FF;
          border-radius: 50%;
          margin: 0 auto 8px;
        }
        .vt-ms-done { color: var(--vt-navy); }
        .vt-ms-done .vt-ms-dot {
          border-color: var(--vt-blue);
          box-shadow: 0 0 0 6px var(--vt-tint);
        }

        /* --- Slide 5: Blueprint --- */
        .vt-bp-grid {
          display: grid;
          grid-template-columns: 1fr 1.1fr;
          gap: 28px;
          width: 100%;
          height: 100%;
          align-items: center;
          text-align: left;
        }
        @media (max-width: 640px) { .vt-bp-grid { grid-template-columns: 1fr; } }

        .vt-checklist-card {
          background: var(--vt-card);
          border-radius: 18px;
          padding: clamp(14px, 2vw, 24px);
          box-shadow: 0 18px 50px rgba(0,0,0,0.2);
        }
        .vt-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 4px;
          border-bottom: 1px solid var(--vt-border);
          font-weight: 700;
          font-size: clamp(11px, 1.2vw, 15px);
          color: var(--vt-text);
        }
        .vt-row:last-of-type { border-bottom: none; }
        .vt-box {
          width: 20px; height: 20px;
          border-radius: 6px;
          background: var(--vt-blue);
          color: #fff;
          display: grid;
          place-items: center;
          font-size: 12px;
          font-weight: 900;
          flex-shrink: 0;
        }

        /* --- Slide 6: Import --- */
        .vt-import-grid {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 28px;
          width: 100%;
          height: 100%;
          align-items: center;
          text-align: left;
        }
        @media (max-width: 640px) { .vt-import-grid { grid-template-columns: 1fr; } }

        .vt-import-card {
          background: var(--vt-card);
          border: 1px solid var(--vt-border);
          border-radius: 18px;
          padding: clamp(14px, 2vw, 24px);
          box-shadow: 0 18px 50px rgba(0,0,0,0.08);
        }
        .vt-metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }
        .vt-metric-n {
          display: block;
          font-size: clamp(26px, 4vw, 52px);
          font-weight: 800;
          letter-spacing: -0.05em;
          color: var(--vt-navy);
        }
        .vt-metric-l {
          display: block;
          font-size: clamp(9px, 1vw, 14px);
          color: var(--vt-muted);
          font-weight: 600;
        }
        .vt-bars { display: grid; gap: 10px; }
        .vt-bar-row {}
        .vt-bar-label {
          display: flex;
          justify-content: space-between;
          font-size: clamp(9px, 1vw, 13px);
          color: var(--vt-muted);
          font-weight: 700;
          margin-bottom: 4px;
        }
        .vt-bar-track {
          height: 8px;
          border-radius: 99px;
          background: #E8EEF8;
          overflow: hidden;
        }
        .vt-bar-fill-h {
          height: 100%;
          border-radius: 99px;
          background: var(--vt-blue);
        }

        /* --- Slide 7: Integrations --- */
        .vt-integrations {
          display: flex;
          flex-wrap: wrap;
          gap: clamp(8px, 1.5vw, 16px);
          justify-content: center;
          margin-top: 28px;
          max-width: 700px;
        }
        .vt-integ {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: clamp(12px, 2vw, 20px) clamp(14px, 2vw, 24px);
          background: var(--vt-card);
          border: 1px solid var(--vt-border);
          border-radius: 16px;
          min-width: clamp(70px, 10vw, 110px);
        }
        .vt-integ-icon { font-size: clamp(18px, 2.5vw, 28px); }
        .vt-integ-label {
          font-size: clamp(9px, 1vw, 13px);
          font-weight: 700;
          color: var(--vt-text);
        }

        /* --- Slide 8: Today's Plan --- */
        .vt-plan-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 28px;
          width: 100%;
          height: 100%;
          align-items: center;
          text-align: left;
        }
        @media (max-width: 640px) { .vt-plan-grid { grid-template-columns: 1fr; } }

        .vt-todos { display: grid; gap: 10px; margin-top: 18px; }
        .vt-todo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          font-size: clamp(11px, 1.3vw, 16px);
          color: var(--vt-navy);
        }
        .vt-todo-dot {
          width: 9px; height: 9px;
          border-radius: 50%;
          background: var(--vt-blue);
          flex-shrink: 0;
        }
        .vt-nba-card {
          background: var(--vt-card);
          border: 1px solid var(--vt-border);
          border-radius: 18px;
          padding: clamp(16px, 2.5vw, 26px);
          box-shadow: 0 18px 50px rgba(0,0,0,0.08);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .vt-nba-title {
          font-size: clamp(16px, 2.2vw, 26px);
          font-weight: 800;
          letter-spacing: -0.035em;
          color: var(--vt-navy);
          margin: 0;
        }

        /* --- Slide 9: CTA --- */
        .vt-cta-h {
          font-size: clamp(22px, 4vw, 48px);
          font-weight: 800;
          letter-spacing: -0.04em;
          line-height: 1.1;
          color: var(--vt-text);
          margin: 0;
        }
        .vt-cta-btn {
          display: inline-block;
          background: var(--vt-blue);
          color: #fff;
          font-weight: 800;
          font-size: clamp(14px, 1.5vw, 18px);
          padding: 12px 32px;
          border-radius: 12px;
          margin-top: 24px;
          box-shadow: 0 10px 30px rgba(59,130,246,0.35);
          text-decoration: none;
        }
        .vt-cta-btn:hover { filter: brightness(1.08); }
        .vt-cta-url {
          font-size: clamp(12px, 1.3vw, 16px);
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--vt-blue);
          margin-top: 14px;
        }

        /* --- HUD controls --- */
        .vt-hud {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 10px 14px;
          background: linear-gradient(transparent, rgba(0,0,0,0.5));
          position: absolute;
          bottom: 0; left: 0; right: 0;
          z-index: 20;
        }
        .vt-hud-btn {
          background: rgba(255,255,255,0.15);
          border: 1px solid rgba(255,255,255,0.25);
          color: #fff;
          font-weight: 700;
          font-size: 12px;
          padding: 5px 12px;
          border-radius: 8px;
          cursor: pointer;
        }
        .vt-hud-btn:hover { background: rgba(255,255,255,0.25); }
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

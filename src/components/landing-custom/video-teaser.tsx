"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SLIDES = Array.from(
  { length: 11 },
  (_, index) => `/agentstack-presentation/slide-${index + 1}.webp`,
);

const SLIDE_DURATION_MS = 5000;

export function VideoTeaser() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % SLIDES.length);
    }, SLIDE_DURATION_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      id="video-teaser"
      className="scroll-mt-8 bg-gradient-to-b from-[#FFF6E8] to-[#F8E9D5] py-16 md:py-24"
    >
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-blue-500">
            See it in action
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Watch the AgentStack difference
          </h2>
          <p className="mt-3 text-muted-foreground">
            See how AgentStack turns missed leads into closed deals.
          </p>
        </div>

        <div
          className="relative mx-auto aspect-video max-w-5xl overflow-hidden rounded-2xl border bg-[#f8f0e5] shadow-2xl"
          aria-label="AgentStack product presentation"
        >
          {SLIDES.map((slide, index) => (
            <Image
              key={slide}
              src={slide}
              alt={`AgentStack presentation slide ${index + 1}`}
              fill
              priority={index === 0}
              sizes="(max-width: 1024px) 100vw, 1024px"
              className={`object-cover transition-opacity duration-700 ${
                index === activeSlide ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

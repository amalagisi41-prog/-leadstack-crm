"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CircleCheck,
  Heart,
  KeyRound,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo-mark";

const SLIDES = Array.from(
  { length: 8 },
  (_, index) => `/agentstack-presentation/slide-${index + 1}.webp`,
);

const SLIDE_DURATION_MS = 5000;
const TOTAL_SLIDES = SLIDES.length + 2;

const lifecycle = [
  { label: "Capture", Icon: UserPlus },
  { label: "Nurture", Icon: Heart },
  { label: "Convert", Icon: CircleCheck },
  { label: "Close", Icon: KeyRound },
  { label: "Grow", Icon: BarChart3 },
];

export function VideoTeaser() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % TOTAL_SLIDES);
    }, SLIDE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section id="video-teaser" className="scroll-mt-16 bg-white px-4 pb-16 md:pb-20">
      <div className="container mx-auto">
        <div
          className="relative mx-auto aspect-video max-w-5xl overflow-hidden rounded-2xl border border-[#173B7A]/10 bg-[#f8f0e5] shadow-2xl"
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
              className={`object-contain transition-opacity duration-700 ${
                index === activeSlide ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}

          <div
            className={`absolute inset-0 flex items-center bg-[#031226] px-5 transition-opacity duration-700 sm:px-10 ${
              activeSlide === SLIDES.length ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={activeSlide !== SLIDES.length}
          >
            <div className="mx-auto grid w-full max-w-4xl grid-cols-5">
              {lifecycle.map(({ label, Icon }) => (
                <div
                  key={label}
                  className="flex min-w-0 flex-col items-center border-r border-white/20 px-1 text-center last:border-r-0 sm:px-4"
                >
                  <Icon
                    strokeWidth={1.7}
                    className="h-9 w-9 text-[#F15AA7] sm:h-16 sm:w-16 md:h-20 md:w-20"
                  />
                  <span className="mt-4 text-xs font-semibold text-white sm:text-lg md:text-2xl">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className={`absolute inset-0 flex items-center justify-center bg-[#031226] px-6 transition-opacity duration-700 ${
              activeSlide === SLIDES.length + 1
                ? "opacity-100"
                : "pointer-events-none opacity-0"
            }`}
            aria-hidden={activeSlide !== SLIDES.length + 1}
          >
            <div className="flex items-center gap-4 sm:gap-7">
              <LogoMark
                size={132}
                idSuffix="-video-close"
                className="h-20 w-20 sm:h-32 sm:w-32"
              />
              <div className="text-left">
                <div className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl md:text-7xl">
                  Agent
                  <span className="bg-gradient-to-r from-[#F15AA7] to-[#8B3FE0] bg-clip-text text-transparent">
                    Stack
                  </span>
                </div>
                <div className="mt-2 text-[9px] font-semibold uppercase tracking-[0.32em] text-white sm:text-sm md:text-base">
                  Real Estate Solutions
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-8 flex max-w-4xl flex-col items-center gap-6">
          <div className="w-full rounded-full border border-[#173B7A]/20 bg-[#FFF6E8] px-5 py-3 text-center font-sans text-sm font-semibold text-[#173B7A] sm:text-base">
            The operating system for modern real estate professionals
          </div>
          <Button
            render={<Link href="/signup" />}
            size="lg"
            className="bg-[#1a2f50] px-7 text-base text-white hover:bg-[#243d66]"
          >
            Start Free <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

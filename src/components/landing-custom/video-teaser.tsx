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

const SLIDES = Array.from(
  { length: 8 },
  (_, index) => `/agentstack-presentation/slide-${index + 1}.webp`,
);

const SLIDE_DURATION_MS = 5000;
const CLOSING_FRAMES = 3;
const TOTAL_SLIDES = SLIDES.length + CLOSING_FRAMES;

const lifecycle = [
  { label: "Capture", detail: "Leads", Icon: UserPlus },
  { label: "Nurture", detail: "Relationships", Icon: Heart },
  { label: "Convert", detail: "Showings", Icon: CircleCheck },
  { label: "Close", detail: "Deals", Icon: KeyRound },
  { label: "Grow", detail: "Your Business", Icon: BarChart3 },
];

function ClosingWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      src="/brand/agentstack-closing-logo.png"
      alt="AgentStack Real Estate Solutions"
      width={872}
      height={368}
      className={compact ? "h-auto w-full max-w-[260px]" : "h-auto w-[80%] max-w-[780px]"}
    />
  );
}

function FadeFrame({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute inset-0 bg-[#031226] transition-opacity duration-700 ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

export function VideoTeaser() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % TOTAL_SLIDES);
    }, SLIDE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, []);

  const closingStart = SLIDES.length;

  return (
    <section id="video-teaser" className="scroll-mt-16 overflow-x-hidden bg-white px-4 pb-16 md:pb-20">
      <div className="mx-auto w-full max-w-6xl">
        <div
          className="relative mx-auto aspect-video w-[calc(100vw-2rem)] max-w-5xl overflow-hidden rounded-2xl border border-[#173B7A]/10 bg-[#f8f0e5] shadow-2xl"
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

          <FadeFrame active={activeSlide === closingStart}>
            <div className="grid h-full grid-cols-[42%_58%] items-center gap-4 px-5 sm:px-10">
              <div>
                <ClosingWordmark compact />
                <h3 className="mt-5 text-lg font-semibold leading-tight text-white sm:text-3xl md:text-4xl">
                  The easiest way to run your{" "}
                  <span className="text-[#F15AA7]">real estate business.</span>
                </h3>
                <p className="mt-3 text-xs font-medium text-[#F15AA7] sm:text-lg">
                  Work less. Close more. Live better.
                </p>
              </div>
              <div className="grid grid-cols-5 border-l border-[#D84A91] pl-3 sm:pl-6">
                {lifecycle.map(({ label, detail, Icon }) => (
                  <div key={label} className="flex min-w-0 flex-col items-center text-center">
                    <Icon className="h-6 w-6 text-[#F15AA7] sm:h-10 sm:w-10" strokeWidth={1.7} />
                    <span className="mt-3 text-[8px] font-semibold text-white sm:text-sm">{label}</span>
                    <span className="text-[7px] leading-tight text-white/80 sm:text-xs">{detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeFrame>

          <FadeFrame active={activeSlide === closingStart + 1}>
            <div className="flex h-full items-center justify-center px-6">
              <ClosingWordmark />
            </div>
          </FadeFrame>

          <FadeFrame active={activeSlide === closingStart + 2}>
            <div className="flex h-full items-center justify-center px-6">
              <div className="grid w-full max-w-3xl grid-cols-5">
                {lifecycle.map(({ label, Icon }) => (
                  <div
                    key={label}
                    className="flex min-w-0 flex-col items-center border-r border-white/20 text-center last:border-r-0"
                  >
                    <Icon
                      strokeWidth={1.7}
                      className="h-5 w-5 text-[#F15AA7] sm:h-8 sm:w-8 md:h-10 md:w-10"
                    />
                    <span className="mt-3 text-[9px] font-semibold text-white sm:text-sm md:text-base">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </FadeFrame>
        </div>

        <div className="mx-auto mt-8 flex max-w-4xl flex-col items-center gap-6">
          <div className="box-border w-[calc(100vw-2rem)] max-w-4xl rounded-3xl border border-[#173B7A]/20 bg-[#FFF6E8] px-4 py-3 text-center font-sans text-sm font-semibold leading-snug text-[#173B7A] sm:rounded-full sm:px-5 sm:text-base">
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

"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

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
              className={`object-cover transition-opacity duration-700 ${
                index === activeSlide ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
        </div>
        <div className="mt-8 flex justify-center">
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

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="bg-white px-4 pb-8 pt-10 text-center md:pb-10 md:pt-14">
      <p className="mb-6 font-serif text-sm font-semibold uppercase tracking-[0.32em] text-[#173B7A] sm:text-base">
        Real Estate Solutions
      </p>

      <h1 className="mx-auto max-w-5xl text-balance font-serif text-4xl font-semibold leading-tight tracking-tight text-[#173B7A] sm:text-5xl md:text-6xl">
        Turn missed leads into{" "}
        <span className="font-sans font-normal italic text-[#DB4F9B]">
          closed deals.
        </span>
      </h1>

      <div className="mx-auto mt-7 inline-flex rounded-full border border-[#173B7A]/20 bg-[#FFF6E8] px-5 py-2 font-serif text-sm font-semibold text-[#173B7A] sm:text-base">
        The operating system for modern real estate professionals
      </div>

      <div className="mt-6 flex justify-center">
        <Button
          render={<Link href="/signup" />}
          size="lg"
          className="bg-[#1a2f50] px-7 text-base text-white hover:bg-[#243d66]"
        >
          Start Free <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}

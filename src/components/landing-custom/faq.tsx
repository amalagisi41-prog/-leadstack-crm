"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ResolvedBrand } from "@/config/landing";

const faqs = [
  {
    question: "Why switch from GoHighLevel?",
    answer:
      "AgentStack CRM is built exclusively for realtors. Organize buyer inquiries, listing appointments, showings, offers, and closings with guided setup instead of configuring a general-purpose CRM.",
  },
  {
    question: "How fast will leads get a response?",
    answer:
      "The Respond goal is a first response under 60 seconds. AI Web Chat and AI Assist, and SMS and voice automation, are Private Preview. Actual response time depends on connected channels and approved workflows; test a buyer inquiry before activation.",
  },
  {
    question: "Can I import my GoHighLevel contacts?",
    answer:
      "Yes. Export contacts as CSV, combine first and last names into one Name column, and map Email, Phone, Company, Source, and Tags. Review duplicates before importing. Deals and conversation history are separate from this contact importer.",
  },
  {
    question: "Does it work for teams and brokerages?",
    answer:
      "AgentStack Solo is the current offer for an individual real estate agent. Brokerage and multi-office plans are Coming Soon.",
  },
  {
    question: "How does the AI work?",
    answer:
      "AI Web Chat and AI Assist are Private Preview. Configure your Business Blueprint and persona, review the generated instructions, and test real estate scenarios before using a channel with clients.",
  },
  {
    question: "What is available today?",
    answer:
      "People, deals, tasks, calendar, lead forms, booking pages, guided setup, and Stripe billing are Live. See Feature availability for the separate Private Preview and Coming Soon lists.",
  },
];

export function FAQ({ brand }: { brand: ResolvedBrand }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-white py-24 md:py-28">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold tracking-[0.28em] text-[#173B7A] uppercase">
            Frequently asked
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#173B7A] sm:text-5xl">
            Frequently{" "}
            <span className="font-sans font-normal text-[#DB4F9B] italic">
              asked
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#526078] sm:text-lg">
            Can&apos;t find what you&apos;re looking for? Email{" "}
            <a
              href={`mailto:${brand.supportEmail}`}
              className="text-[#173B7A] underline decoration-[#173B7A]/30 decoration-2 underline-offset-4 hover:decoration-[#173B7A]/60"
            >
              {brand.supportEmail}
            </a>
            .
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl space-y-4">
          {faqs.map(({ question, answer }, index) => (
            <div
              key={question}
              className="overflow-hidden rounded-[1.5rem] border border-[#E7DCC7] bg-[#FFF8EF] shadow-[0_12px_32px_rgba(23,59,122,0.05)]"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="flex w-full items-center justify-between px-5 py-5 text-left text-base font-medium text-[#173B7A] transition-colors hover:text-[#DB4F9B] sm:px-6"
              >
                {question}
                <ChevronDown
                  className={cn(
                    "ml-4 h-4 w-4 shrink-0 text-[#7B8AA1] transition-transform duration-200",
                    openIndex === index && "rotate-180"
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid transition-all duration-200",
                  openIndex === index
                    ? "grid-rows-[1fr] px-5 pb-5 sm:px-6"
                    : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <p className="text-sm leading-7 text-[#526078] sm:text-base">
                    {answer}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

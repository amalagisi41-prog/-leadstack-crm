"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResolvedBrand } from "@/config/landing";

const faqs = [
  {
    question: "I already use Chime / Follow Up Boss / KvCORE. Why switch?",
    answer:
      "Those are CRMs — they store your contacts. AgentStack is a business operating system — it tells you what to do next, responds to leads for you, and keeps every follow-up moving automatically. Set up your Business Blueprint once and AgentStack configures AI, lead capture, and follow-up around it. No per-seat surprises.",
  },
  {
    question: "How fast will leads get a response?",
    answer:
      "Under 60 seconds for SMS and email. When a buyer submits your lead form, AgentStack fires a personalized text and email immediately — while you're showing a home or in a closing. The AI agent can also answer follow-up questions, book showings, and qualify the lead before you pick up the phone.",
  },
  {
    question: "Can I import my contacts from another system?",
    answer:
      "Yes. Drop in a CSV from Follow Up Boss, Chime, KvCORE, Zillow, Realtor.com, or Google Contacts. We fuzzy-match names, emails, and phones automatically. GHL users can connect via the one-click import tool — contacts and deals come over in minutes.",
  },
  {
    question: "Does it work for teams and brokerages?",
    answer:
      "Yes. The Broker plan gives each agent their own sub-account (isolated contacts and deals) under one brokerage login. Territory assignment routes inbound leads to the right agent automatically. Brokers get a top-level view across all agents. Top-producing luxury teams can start from the Luxury Broker plan for a concierge-tuned setup out of the box.",
  },
  {
    question: "How does the AI work?",
    answer:
      "You never write prompts or build automations. You answer simple business questions in your Business Blueprint — hours, services, preferred vendors, brand voice — and AgentStack configures the AI automatically. It handles inbound texts, web chat, and phone calls — qualifying leads, answering questions, and booking showings. When someone's ready to move, you get flagged and alerted immediately.",
  },
  {
    question: "Is my client data safe?",
    answer:
      "All data is owner-scoped — only you and the people you invite can access your workspace. Encrypted at rest, exportable as CSV at any time, hosted on enterprise-grade infrastructure. We never sell or share your contact data.",
  },
];

export function FAQ({ brand }: { brand: ResolvedBrand }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tighter sm:text-5xl">
            Frequently{" "}
            <span className="font-sans font-normal italic">asked</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Can&apos;t find what you&apos;re looking for? Email{" "}
            <a
              href={`mailto:${brand.supportEmail}`}
              className="text-primary hover:underline"
            >
              {brand.supportEmail}
            </a>
            .
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl divide-y">
          {faqs.map(({ question, answer }, index) => (
            <div key={question}>
              <button
                onClick={() =>
                  setOpenIndex(openIndex === index ? null : index)
                }
                className="flex w-full items-center justify-between py-5 text-left text-sm font-medium transition-colors hover:text-primary"
              >
                {question}
                <ChevronDown
                  className={cn(
                    "ml-4 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    openIndex === index && "rotate-180",
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid transition-all duration-200",
                  openIndex === index
                    ? "grid-rows-[1fr] pb-5"
                    : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <p className="text-sm leading-relaxed text-muted-foreground">
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

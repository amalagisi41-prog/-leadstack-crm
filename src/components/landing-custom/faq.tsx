"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResolvedBrand } from "@/config/landing";

const faqs = [
  {
    question: "How do I get started?",
    answer:
      "No coding required. We use a byo accounts model — you connect your own services, so you stay in control of your data and costs. Budget around a couple of hours if it's your first time and this isn't something you do every day (faster if it is). To start, you only need a login & database service. From there, add payments, email, messaging (SMS), background jobs, AI, a website builder, and maps as you switch features on. Optional extras include website-knowledge for AI, voice calling, ad tracking, and live chat. Your setup assistant walks you through each one.",
  },
  {
    question: "How do imports work?",
    answer:
      "Drop in a CSV from Sheets, HubSpot, Pipedrive, or anywhere else. Our importer fuzzy-matches name / email / phone / company columns automatically; map anything else manually.",
  },
  {
    question: "What about email and SMS?",
    answer:
      "Send from any contact profile in one click — replies route straight to your inbox via Reply-To. Email runs through our verified domain; SMS via a managed sender.",
  },
  {
    question: "How fast can I get a website live?",
    answer:
      "Built-in website builder ships a marketing site or video sales letter in 1–3 minutes. Multi-page or single-page funnel — pick a niche template, fill the form, hit Build, get a live URL.",
  },
  {
    question: "Is my data safe?",
    answer:
      "All data is owner-scoped — only you and the people you invite can read or write to your workspace. Daily backups, encrypted at rest, exportable as CSV at any time.",
  },
  {
    question: "Do you have an API?",
    answer:
      "The form submission endpoint is public; full read/write API is on the roadmap. In the meantime, every page exports CSV and the underlying database is queryable directly.",
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
            <span className="font-serif font-normal italic">asked</span>
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

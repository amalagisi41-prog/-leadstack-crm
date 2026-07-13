"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  ArrowRight,
  Check,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import {
  BRAND_VOICES,
  EMPTY_BUSINESS_PROFILE,
  SERVICE_SPECIALTIES,
  type BusinessProfileContent,
} from "@/types/business-profile";

/**
 * "Tell us about your business once. AgentStack handles the rest."
 *
 * The setup surface for the central Business Profile. Every field feeds the
 * compiled Business Profile block that every AI agent reads before acting,
 * so this one form grounds the receptionist, follow-up, intake, listing-copy
 * and review agents at the same time.
 */

const input =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted-foreground">{desc}</p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function BusinessProfileForm() {
  const { subAccountId, saPath } = useSubAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromWizard = searchParams.get("from") === "wizard";
  const [content, setContent] = useState<BusinessProfileContent>(
    EMPTY_BUSINESS_PROFILE,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completeness, setCompleteness] = useState(0);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/sub-accounts/${subAccountId}/business-profile`,
        );
        const data = (await res.json()) as {
          profile: BusinessProfileContent;
          completeness: number;
        };
        if (!active) return;
        setContent({ ...EMPTY_BUSINESS_PROFILE, ...data.profile });
        setCompleteness(data.completeness);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [subAccountId]);

  function set<K extends keyof BusinessProfileContent>(
    key: K,
    value: BusinessProfileContent[K],
  ) {
    setContent((c) => ({ ...c, [key]: value }));
  }

  function toggleService(id: (typeof SERVICE_SPECIALTIES)[number]["id"]) {
    setContent((c) => ({
      ...c,
      services: c.services.includes(id)
        ? c.services.filter((s) => s !== id)
        : [...c.services, id],
    }));
  }

  function setFaq(i: number, field: "q" | "a", value: string) {
    setContent((c) => {
      const faqs = [...c.faqs];
      faqs[i] = { ...faqs[i], [field]: value };
      return { ...c, faqs };
    });
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/business-profile`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(content),
        },
      );
      const data = (await res.json()) as {
        completeness?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      setCompleteness(data.completeness ?? completeness);
      toast.success("Business Blueprint saved. Every AI tool now uses it.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function generatePersona() {
    setGenerating(true);
    try {
      // Save first so the generator reads the freshest profile.
      const ok = await save();
      if (!ok) return;
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/business-profile/generate-persona`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apply: true }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate.");
      toast.success(
        "AI persona generated and applied. Your assistants are ready.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your profile…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="rounded-2xl border bg-gradient-to-br from-[#1b3d7a] to-[#16305f] p-6 text-white">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <h1 className="text-xl font-bold">Your Business Blueprint</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-blue-100/90">
          Tell us about your business once. This is your AgentStack Knowledge
          Base — every AI assistant, follow-up, text, email, and landing page
          works from it automatically. The more you fill in, the smarter every
          tool gets.
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-blue-100/80">
            <span>Profile completeness</span>
            <span>{completeness}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>
      </div>

      {/* 1. Agent profile */}
      <Section
        title="1. About you"
        desc="Who you are and how leads reach you."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name">
            <input
              className={input}
              value={content.agentName}
              onChange={(e) => set("agentName", e.target.value)}
              placeholder="Jane Agent"
            />
          </Field>
          <Field label="Brokerage">
            <input
              className={input}
              value={content.brokerage}
              onChange={(e) => set("brokerage", e.target.value)}
              placeholder="Keller Williams Metro"
            />
          </Field>
          <Field label="Licensed in (states)">
            <input
              className={input}
              value={content.licenseStates}
              onChange={(e) => set("licenseStates", e.target.value)}
              placeholder="NJ, NY"
            />
          </Field>
          <Field label="License number">
            <input
              className={input}
              value={content.licenseNumber}
              onChange={(e) => set("licenseNumber", e.target.value)}
              placeholder="1234567"
            />
          </Field>
          <Field label="Phone">
            <input
              className={input}
              value={content.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="(555) 123-4567"
            />
          </Field>
          <Field label="Email">
            <input
              className={input}
              value={content.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="jane@brokerage.com"
            />
          </Field>
          <Field label="Website">
            <input
              className={input}
              value={content.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://janesells.com"
            />
          </Field>
          <Field label="Languages spoken">
            <input
              className={input}
              value={content.languages}
              onChange={(e) => set("languages", e.target.value)}
              placeholder="English, Spanish"
            />
          </Field>
        </div>
      </Section>

      {/* 2. Market areas */}
      <Section
        title="2. Your market"
        desc="Where you work and what you specialize in — so the AI never sends a lead to the wrong town."
      >
        <Field
          label="Service areas (towns / neighborhoods)"
          hint="List the places you serve, separated by commas."
        >
          <textarea
            rows={2}
            className={input}
            value={content.serviceAreas}
            onChange={(e) => set("serviceAreas", e.target.value)}
            placeholder="Maplewood, South Orange, Millburn, Montclair"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Typical price ranges">
            <input
              className={input}
              value={content.priceRanges}
              onChange={(e) => set("priceRanges", e.target.value)}
              placeholder="$400k–$1.2M"
            />
          </Field>
          <Field label="Specialties / niche">
            <input
              className={input}
              value={content.specialties}
              onChange={(e) => set("specialties", e.target.value)}
              placeholder="Historic homes, first-time buyers"
            />
          </Field>
        </div>
      </Section>

      {/* 3. Services */}
      <Section
        title="3. What you offer"
        desc="Pick the services you provide. This drives which funnels and follow-up plans AgentStack recommends."
      >
        <div className="flex flex-wrap gap-2">
          {SERVICE_SPECIALTIES.map((s) => {
            const on = content.services.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleService(s.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  on
                    ? "border-[#1b3d7a] bg-[#1b3d7a] text-white"
                    : "text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {on ? <Check className="mr-1 inline h-3 w-3" /> : null}
                {s.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* 4. Brand voice */}
      <Section
        title="4. Your voice"
        desc="How should the AI sound when it speaks for you?"
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {BRAND_VOICES.map((v) => {
            const on = content.brandVoice === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => set("brandVoice", v.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  on
                    ? "border-[#1b3d7a] bg-[#1b3d7a]/5"
                    : "hover:border-foreground/30"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {on ? <Check className="h-3.5 w-3.5 text-[#1b3d7a]" /> : null}
                  {v.label}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {v.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 5. Business rules */}
      <Section
        title="5. How you work"
        desc="Your availability and how you want leads handled."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business hours">
            <input
              className={input}
              value={content.businessHours}
              onChange={(e) => set("businessHours", e.target.value)}
              placeholder="Mon–Fri 9–6, Sat by appointment"
            />
          </Field>
          <Field label="Lead response preference">
            <input
              className={input}
              value={content.responsePreference}
              onChange={(e) => set("responsePreference", e.target.value)}
              placeholder="Text first, then call within an hour"
            />
          </Field>
        </div>
        <Field
          label="Hand off to a human when…"
          hint="When should the AI stop and get you involved?"
        >
          <textarea
            rows={2}
            className={input}
            value={content.handoffRules}
            onChange={(e) => set("handoffRules", e.target.value)}
            placeholder="The lead is ready to make an offer, or asks for legal/contract details."
          />
        </Field>
        <Field label="Alert me (escalate) when…">
          <textarea
            rows={2}
            className={input}
            value={content.escalationRules}
            onChange={(e) => set("escalationRules", e.target.value)}
            placeholder="A hot lead wants a same-day showing, or someone is upset."
          />
        </Field>
      </Section>

      {/* 6. Lead qualification */}
      <Section
        title="6. Qualifying leads"
        desc="What the AI should find out to tell a serious lead from a tire-kicker."
      >
        <Field label="Qualification questions / criteria">
          <textarea
            rows={3}
            className={input}
            value={content.qualificationRules}
            onChange={(e) => set("qualificationRules", e.target.value)}
            placeholder="Budget, timeline to buy/sell, financing or pre-approval status, property type, and motivation."
          />
        </Field>
      </Section>

      {/* 7. Compliance */}
      <Section
        title="7. Compliance guardrails"
        desc="Rules the AI will never break. Recommended to keep both on."
      >
        <ToggleRow
          label="Enforce Fair Housing"
          hint="The AI never steers or references protected characteristics."
          checked={content.fairHousing}
          onChange={(v) => set("fairHousing", v)}
        />
        <ToggleRow
          label="No legal, tax, or financial advice"
          hint="The AI defers to a licensed professional instead."
          checked={content.noLegalTaxAdvice}
          onChange={(v) => set("noLegalTaxAdvice", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Brokerage disclosure (if required)">
            <input
              className={input}
              value={content.brokerageDisclosure}
              onChange={(e) => set("brokerageDisclosure", e.target.value)}
              placeholder="Jane Agent, Keller Williams — Lic# 1234567"
            />
          </Field>
          <Field label="Opt-out language">
            <input
              className={input}
              value={content.optOutLanguage}
              onChange={(e) => set("optOutLanguage", e.target.value)}
              placeholder="Reply STOP to opt out."
            />
          </Field>
        </div>
      </Section>

      {/* 8. Assets */}
      <Section
        title="8. Your assets"
        desc="Bio, links, and vendors the AI can reference and share."
      >
        <Field label="Short bio">
          <textarea
            rows={3}
            className={input}
            value={content.bio}
            onChange={(e) => set("bio", e.target.value)}
            placeholder="11 years serving Essex County. Top 1% in Maplewood. Known for…"
          />
        </Field>
        <Field
          label="Brand logo sheet"
          hint="The approved logo reference your AI tools and website workflows should use."
        >
          <input
            className={input}
            value={content.logoUrl}
            onChange={(e) => set("logoUrl", e.target.value)}
            placeholder="https://…/logo-sheet.jpg"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Buyer guide link">
            <input
              className={input}
              value={content.buyerGuideUrl}
              onChange={(e) => set("buyerGuideUrl", e.target.value)}
              placeholder="https://…/buyer-guide.pdf"
            />
          </Field>
          <Field label="Seller guide link">
            <input
              className={input}
              value={content.sellerGuideUrl}
              onChange={(e) => set("sellerGuideUrl", e.target.value)}
              placeholder="https://…/seller-guide.pdf"
            />
          </Field>
        </div>
        <Field
          label="Preferred vendors"
          hint="Lenders, attorneys, inspectors, photographers the AI can recommend."
        >
          <textarea
            rows={2}
            className={input}
            value={content.vendors}
            onChange={(e) => set("vendors", e.target.value)}
            placeholder="Lender: Sam at Rate Inc. · Inspector: Ace Home Inspections"
          />
        </Field>
        <Field label="Testimonials">
          <textarea
            rows={2}
            className={input}
            value={content.testimonials}
            onChange={(e) => set("testimonials", e.target.value)}
            placeholder="“Jane sold our home in 6 days over asking.” — The Rivers family"
          />
        </Field>
      </Section>

      {/* 9. FAQs */}
      <Section
        title="9. FAQs"
        desc="Approved answers the AI can use word-for-word. Great for the questions you get all the time."
      >
        <div className="space-y-3">
          {content.faqs.map((f, i) => (
            <div key={i} className="rounded-xl border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  FAQ {i + 1}
                </span>
                <button
                  onClick={() =>
                    set(
                      "faqs",
                      content.faqs.filter((_, idx) => idx !== i),
                    )
                  }
                  className="text-muted-foreground hover:text-red-500"
                  aria-label="Remove FAQ"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input
                className={`${input} mb-2`}
                value={f.q}
                onChange={(e) => setFaq(i, "q", e.target.value)}
                placeholder="Question — e.g. Do you charge for a home valuation?"
              />
              <textarea
                rows={2}
                className={input}
                value={f.a}
                onChange={(e) => setFaq(i, "a", e.target.value)}
                placeholder="Approved answer — e.g. No, my home valuations are always free and no-obligation."
              />
            </div>
          ))}
          {content.faqs.length < 30 ? (
            <button
              onClick={() => set("faqs", [...content.faqs, { q: "", a: "" }])}
              className="flex items-center gap-1 text-xs font-medium text-[#1b3d7a] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add an FAQ
            </button>
          ) : null}
        </div>
      </Section>

      {/* AI setup — confirm-and-go */}
      <Section
        title="AI setup — done for you"
        desc="No prompt-writing. Generate a ready-to-use AI persona straight from everything above."
      >
        <div className="flex items-start gap-3 rounded-xl border border-blue-200/60 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-blue-900/80 dark:text-blue-100/80">
              We&apos;ll write your AI assistant&apos;s voice from your profile
              and apply it to every channel — chat, SMS, and voice. You can fine
              tune it later on the AI Agents page.
            </p>
            <Button
              className="mt-3"
              size="sm"
              onClick={generatePersona}
              disabled={generating || saving}
            >
              {generating ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3.5 w-3.5" />
              )}
              Generate my AI assistant
            </Button>
          </div>
        </div>
      </Section>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            Saved to your private workspace. Used only by your AI tools.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              Save profile
            </Button>
            {fromWizard && (
              <Button
                onClick={async () => {
                  const ok = await save();
                  if (ok) router.push(saPath("/get-started"));
                }}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-1 h-4 w-4" />
                )}
                Save &amp; Continue setup
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg border p-3 text-left"
    >
      <span
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-[#1b3d7a]" : "bg-muted"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

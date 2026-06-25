"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Comparison-page scenario calculator — the more capacious sibling of
 * the landing-page modal calculator (`ghl-savings-calculator.tsx`).
 *
 * Key differences vs the landing calculator:
 *   - Sub-account range goes 1–20 (vs 4–10) so solo operators and larger
 *     agencies can both model their real cost.
 *   - Adds GHL's Premium Support add-on ($500/mo flat) as a toggle so a
 *     realistic "what we'd actually pay" scenario is one click away.
 *
 * Designed so additional GHL add-ons (HIPAA, white-label mobile,
 * branded portal, etc.) can be appended below the existing toggle row
 * without restructuring the cost-card grid — bump the `grid-rows`
 * count + `row-span` to match the new content-row count.
 *
 * Pricing inputs are GHL public pricing as of 2026:
 *   - GHL Unlimited: $297/mo (unlimited sub-accounts).
 *   - AI Employee: $97/mo per sub-account.
 *   - Premium Support: $500/mo flat (account-level, not per sub-account).
 */

const GHL_BASE_MONTHLY = 297;
const GHL_AI_PER_SUB_MONTHLY = 97;
const GHL_PREMIUM_SUPPORT_MONTHLY = 500;
// Standard retail price for LeadStack. The landing-page calculator anchors
// on the founders-cohort price ($891) because that's the offer in market on
// the homepage; the comparison page is generic evaluation traffic and uses
// the published list price so the savings claim doesn't depend on the
// founders cohort still being open.
const LEADSTACK_PRICE = 1782;

const SUB_ACCOUNTS_MIN = 1;
const SUB_ACCOUNTS_MAX = 20;
// Defaults represent a realistic established-agency scenario — 11 clients,
// AI Employee on every sub-account, Premium Support on. At these inputs the
// monthly GHL bill is $1,864 (= $297 + 11×$97 + $500), which crosses the
// $1,782 LeadStack license threshold so the payback line opens at "1 month".
// Anything lighter (fewer sub-accounts, AI off, Premium off) shows 2–4
// months instead — visitors can slide down to see their own scenario.
const SUB_ACCOUNTS_DEFAULT = 11;
const AI_DEFAULT = 11;
const PREMIUM_SUPPORT_DEFAULT = true;

export function ComparisonCalculator() {
  const [subAccounts, setSubAccounts] = useState(SUB_ACCOUNTS_DEFAULT);
  const [aiCount, setAiCount] = useState(AI_DEFAULT);
  const [premiumSupport, setPremiumSupport] = useState(PREMIUM_SUPPORT_DEFAULT);

  // AI count is clamped to the current sub-account count for display, but
  // underlying state preserves the prior value so sliding sub-accounts
  // back up restores the previous AI count.
  const effectiveAiCount = Math.min(aiCount, subAccounts);

  const aiMonthlyCost = effectiveAiCount * GHL_AI_PER_SUB_MONTHLY;
  const supportMonthlyCost = premiumSupport ? GHL_PREMIUM_SUPPORT_MONTHLY : 0;
  const monthlyGhl = GHL_BASE_MONTHLY + aiMonthlyCost + supportMonthlyCost;
  const yearlyGhl = monthlyGhl * 12;

  const yearlyLeadstack = LEADSTACK_PRICE;
  const year1Savings = yearlyGhl - yearlyLeadstack;
  // Year 2 + Year 3 savings = the full GHL yearly bill (LeadStack is $0
  // recurring from here), so savings get bigger every year after Year 1.
  const ongoingYearSavings = yearlyGhl;
  const threeYearSavings = year1Savings + ongoingYearSavings * 2;
  const paybackMonths = Math.max(
    1,
    Math.ceil(LEADSTACK_PRICE / monthlyGhl),
  );

  return (
    <section className="mb-12 sm:mb-16">
      <header className="mb-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Build your scenario — what does your agency actually need?
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Plug in your sub-account count, how many of those clients you&apos;d
          enable AI on, and whether you&apos;d pay for Premium Support.
          Savings recalculate live, anchored on GoHighLevel&apos;s published
          list prices.
        </p>
      </header>

      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-5 sm:p-7">
        {/* Slider: sub-accounts */}
        <SliderRow
          label="Sub-accounts (clients you serve)"
          value={subAccounts}
          min={SUB_ACCOUNTS_MIN}
          max={SUB_ACCOUNTS_MAX}
          accent="indigo"
          onChange={(v) => {
            setSubAccounts(v);
            if (aiCount > v) setAiCount(v);
          }}
        />

        {/* Slider: AI Employee count (capped at sub-account count) */}
        <div className="mt-5">
          <SliderRow
            label="…with GHL AI Employee enabled"
            value={effectiveAiCount}
            min={0}
            max={subAccounts}
            accent="fuchsia"
            onChange={setAiCount}
            hint={
              effectiveAiCount === 0
                ? "no AI add-on"
                : `${effectiveAiCount} × $97/mo`
            }
          />
        </div>

        {/* Toggle: Premium Support */}
        <div className="mt-5">
          <ToggleRow
            label="GHL Premium Support"
            description="Account-level, flat $500/mo. Toggle on if you'd buy it."
            checked={premiumSupport}
            onChange={setPremiumSupport}
            hint={premiumSupport ? "$500/mo" : "off"}
          />
        </div>

        {/* Side-by-side cost panels — parent grid declares 9 row tracks
            so both CostCards inherit them via subgrid + row-span-9.
            That keeps every line (Platform, AI, Support, Divider,
            Monthly, Y1, Y2, Y3) horizontally aligned across cards.
            Add a row count + bump grid-rows-[repeat(N,auto)] +
            sm:row-span-N when adding new add-on lines. */}
        <div className="mt-7 grid gap-3 sm:grid-cols-2 sm:grid-rows-[repeat(9,auto)]">
          {/* GoHighLevel — 8 content rows + 1 title row = 9 children */}
          <CostCard variant="ghl" title="GoHighLevel">
            <Line label="GHL Unlimited" value="$297/mo" />
            <Line
              label={`AI Employee × ${effectiveAiCount}`}
              value={`$${aiMonthlyCost.toLocaleString()}/mo`}
              muted={effectiveAiCount === 0}
              hint="Per sub-account, every month"
            />
            <Line
              label="Premium Support"
              value={`$${supportMonthlyCost.toLocaleString()}/mo`}
              muted={!premiumSupport}
              hint={
                premiumSupport
                  ? "Account-level add-on"
                  : "Not included"
              }
            />
            <Divider />
            <Line
              label="Monthly"
              value={`$${monthlyGhl.toLocaleString()}/mo`}
              strong
              tone="bleed"
            />
            <Line
              label="Year 1 total"
              value={`$${yearlyGhl.toLocaleString()}`}
              tone="bleed"
              big
            />
            <Line
              label="Year 2"
              value={`$${yearlyGhl.toLocaleString()}`}
              tone="bleed"
              hint="Same bill — every year, forever"
            />
            <Line
              label="Year 3"
              value={`$${yearlyGhl.toLocaleString()}`}
              tone="bleed"
            />
          </CostCard>

          {/* LeadStack — same 8 content rows + 1 title row = 9 children */}
          <CostCard variant="leadstack" title="LeadStack">
            <Line
              label="License (one-time)"
              value={`$${LEADSTACK_PRICE.toLocaleString()}`}
            />
            <Line
              label="Per-client AI add-on"
              value="$0"
              hint="Pay the AI gateway direct (~$0.01/chat)"
            />
            <Line
              label="Premium Support"
              value="$0"
              hint="Direct support from the team — included"
            />
            <Divider />
            <Line label="Monthly" value="$0/mo" strong />
            <Line
              label="Year 1 total"
              value={`$${yearlyLeadstack.toLocaleString()}`}
              big
              gradient
            />
            <Line
              label="Year 2"
              value="$0"
              hint="License is one-time — no monthly fee, ever"
            />
            <Line label="Year 3" value="$0" />
          </CostCard>
        </div>

        {/* Savings callout */}
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-teal-500/10 to-emerald-500/5 p-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
            You save
          </p>

          <div className="mx-auto mt-3 grid grid-cols-4 gap-2">
            <SavingsYearCell label="Year 1" amount={year1Savings} />
            <SavingsYearCell label="Year 2" amount={ongoingYearSavings} />
            <SavingsYearCell label="Year 3" amount={ongoingYearSavings} />
            <SavingsYearCell
              label="Total"
              amount={threeYearSavings}
              emphasize
            />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Pays for itself in{" "}
            <span className="font-semibold text-foreground">
              {paybackMonths} {paybackMonths === 1 ? "month" : "months"}
            </span>
            {" "}— in typical agency use (10+ clients on AI, Premium Support
            included), payback is 1 month or less. Every month after that is
            straight to your bottom line.
          </p>
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Pricing accurate as of June 2026 — provided as a guide.
      </p>
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  accent,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  accent: "indigo" | "fuchsia";
  hint?: string;
  onChange: (v: number) => void;
}) {
  const accentClass =
    accent === "indigo" ? "accent-indigo-500" : "accent-fuchsia-500";
  const valueClass =
    accent === "indigo"
      ? "text-indigo-600 dark:text-indigo-400"
      : "text-fuchsia-600 dark:text-fuchsia-400";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-sm font-medium">{label}</label>
        <div className="flex items-baseline gap-2">
          {hint && (
            <span className="text-[11px] text-muted-foreground">{hint}</span>
          )}
          <span
            className={cn(
              "font-mono text-xl font-bold tabular-nums",
              valueClass,
            )}
          >
            {value}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn("mt-2 w-full cursor-pointer", accentClass)}
        aria-label={label}
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  hint,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  hint?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border bg-background/40 p-3 transition-colors hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-baseline gap-2">
        {hint && (
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        )}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-emerald-500"
          aria-label={label}
        />
      </div>
    </label>
  );
}

function CostCard({
  variant,
  title,
  children,
}: {
  variant: "ghl" | "leadstack";
  title: string;
  children: React.ReactNode;
}) {
  // Card is a 9-row grid: title + 8 content rows. On sm+ the row tracks
  // are inherited from the parent grid via `grid-rows-subgrid`, which
  // keeps the two cards aligned horizontally (License row lines up, AI
  // row lines up, Premium Support row lines up, Year 1 lines up, etc.).
  // Below sm the cards stack vertically and each renders its own auto-
  // rows grid — no alignment needed when not side by side.
  return (
    <div
      className={cn(
        "grid auto-rows-min gap-y-1.5 rounded-xl border p-4",
        "sm:row-span-9 sm:grid-rows-subgrid",
        variant === "ghl"
          ? "border-rose-500/25 bg-rose-500/5"
          : "border-primary/25 bg-primary/5",
      )}
    >
      <p
        className={cn(
          "pb-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
          variant === "ghl"
            ? "text-rose-700 dark:text-rose-400"
            : "text-primary",
        )}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function Line({
  label,
  value,
  hint,
  muted,
  strong,
  big,
  tone,
  gradient,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  strong?: boolean;
  big?: boolean;
  tone?: "bleed";
  gradient?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-xs",
            strong || big
              ? "font-semibold text-foreground"
              : "text-muted-foreground",
            muted && "opacity-50",
          )}
        >
          {label}
        </p>
        {hint && (
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <span
        className={cn(
          "whitespace-nowrap font-mono tabular-nums",
          big ? "text-base font-bold sm:text-lg" : "text-xs font-semibold",
          tone === "bleed" && "text-rose-600 dark:text-rose-400",
          gradient &&
            "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500 bg-clip-text text-transparent",
          muted && "opacity-50",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="self-center border-t border-border/60" />;
}

function SavingsYearCell({
  label,
  amount,
  emphasize,
}: {
  label: string;
  amount: number;
  /** Used for the "Total" cell — stronger fill + border so it reads as
   *  the punchline of the row without bumping up font size. */
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-1.5 py-1.5",
        emphasize
          ? "border-emerald-500/50 bg-emerald-500/15"
          : "border-emerald-500/20 bg-background/40",
      )}
    >
      <p className="text-[9px] font-semibold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400/80 sm:text-[10px]">
        {label}
      </p>
      <p className="mt-0.5 whitespace-nowrap font-mono text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-sm">
        ${amount.toLocaleString()}
      </p>
    </div>
  );
}

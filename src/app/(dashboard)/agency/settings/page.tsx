"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { BrandingSection } from "@/components/agency/branding-section";
import { CreditCard } from "lucide-react";
import { OnboardingVideosSection } from "@/components/agency/onboarding-videos-section";
import { MessagingSection } from "@/components/agency/messaging-section";
import { SeedDemoSection } from "@/components/agency/seed-demo-section";
import { PasswordSection } from "@/components/settings/password-section";
import { LANDING_VARIANT } from "@/config/landing";

export default function AgencySettingsPage() {
  const { agencyRole, loading } = useAuth();

  if (!loading && agencyRole !== "owner") {
    return (
      <div className="bg-card mx-auto max-w-3xl rounded-2xl border p-8 text-center">
        <p className="text-muted-foreground text-sm">
          Only the agency owner can manage agency-level settings.
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/agency" />}
          className="mt-4"
        >
          Back to agency
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agency Settings</h1>
        <p className="text-muted-foreground text-sm">
          Agency-level configuration. These settings apply across every
          sub-account and the public landing page.
        </p>
      </div>

      <BrandingSection />

      {/* Billing lives in one place: the Billing page (also in the sidebar). */}
      <section className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CreditCard className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Billing</h2>
            <p className="text-muted-foreground text-xs">Your plan, add-ons, invoices and payment method.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/agency/billing" />}>
          Open Billing
        </Button>
      </section>

      {/* Per-step onboarding walkthrough video URLs — surface as "Watch"
          buttons on the new-agent dashboard checklist. Agency-wide (recorded
          once, shown to every sub-account). */}
      <OnboardingVideosSection />

      {/* Read-only view of the shared (env-var) Twilio + Resend senders, so the
          owner can see exactly what "agency-level" SMS/email resolves to. */}
      <MessagingSection />

      {/* Password change — user-level concern but mounted on both the
          agency-settings and sub-account-settings pages so it's reachable
          wherever the operator happens to be sitting. Same component
          either place; handles its own reauth. */}
      <PasswordSection />

      {/* Demo seed/unseed panel — AgentStack-branded deployment only.
          Buyer clones (LANDING_VARIANT === "custom") don't see this, and
          the underlying API route 404s for them too. */}
      {LANDING_VARIANT === "agentstack" && <SeedDemoSection />}
    </div>
  );
}

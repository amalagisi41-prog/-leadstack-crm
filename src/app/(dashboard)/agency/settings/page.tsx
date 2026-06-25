"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { BrandingSection } from "@/components/agency/branding-section";
import { MessagingSection } from "@/components/agency/messaging-section";
import { SeedDemoSection } from "@/components/agency/seed-demo-section";
import { PasswordSection } from "@/components/settings/password-section";
import { LANDING_VARIANT } from "@/config/landing";

export default function AgencySettingsPage() {
  const { agencyRole, loading } = useAuth();

  if (!loading && agencyRole !== "owner") {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
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
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Agency-level configuration. These settings apply across every
          sub-account and the public landing page.
        </p>
      </div>

      <BrandingSection />

      {/* Read-only view of the shared (env-var) Twilio + Resend senders, so the
          owner can see exactly what "agency-level" SMS/email resolves to. */}
      <MessagingSection />

      {/* Password change — user-level concern but mounted on both the
          agency-settings and sub-account-settings pages so it's reachable
          wherever the operator happens to be sitting. Same component
          either place; handles its own reauth. */}
      <PasswordSection />

      {/* Demo seed/unseed panel — LeadStack-branded deployment only.
          Buyer clones (LANDING_VARIANT === "custom") don't see this, and
          the underlying API route 404s for them too. */}
      {LANDING_VARIANT === "leadstack" && <SeedDemoSection />}
    </div>
  );
}

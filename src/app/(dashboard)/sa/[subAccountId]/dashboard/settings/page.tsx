"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CreditCard, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { useSubAccount } from "@/context/sub-account-context";
import { getUserDoc } from "@/lib/firestore/users";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToDeals } from "@/lib/firestore/deals";
import { serializeCsv, downloadCsv } from "@/lib/csv";
import { toDate } from "@/lib/format";
import { LANDING_VARIANT } from "@/config/landing";
import { SubAccountBrandingSection } from "@/components/settings/sub-account-branding-section";
import { SubAccountContactSection } from "@/components/settings/sub-account-contact-section";
import { SubAccountMembersSection } from "@/components/settings/sub-account-members-section";
import { SubAccountTerritoriesSection } from "@/components/settings/sub-account-territories-section";
import { SubAccountCustomFieldsSection } from "@/components/settings/sub-account-custom-fields-section";
import { SubAccountPipelineSection } from "@/components/settings/sub-account-pipeline-section";
import { GhlImportWizard } from "@/components/import/ghl-import-wizard";
import { SubAccountSmsSection } from "@/components/settings/sub-account-sms-section";
import { SubAccountA2pSection } from "@/components/settings/sub-account-a2p-section";
import { SubAccountMetaSection } from "@/components/settings/sub-account-meta-section";
import { SubAccountEmailDomainSection } from "@/components/settings/sub-account-email-domain-section";
import { SubAccountPayPalSection } from "@/components/settings/sub-account-paypal-section";
import { SubAccountGoogleReviewSection } from "@/components/settings/sub-account-google-review-section";
import { SubAccountDailyBriefingSection } from "@/components/settings/sub-account-daily-briefing-section";
import { SubAccountIdxSection } from "@/components/settings/sub-account-idx-section";
import { SubAccountAddOnsSection } from "@/components/settings/sub-account-add-ons-section";
import { SubAccountStripeSection } from "@/components/settings/sub-account-stripe-section";
import { SubAccountApiKeysSection } from "@/components/settings/sub-account-api-keys-section";
import { SubAccountApiRecipesSection } from "@/components/settings/sub-account-api-recipes-section";
import { SubAccountCalendarSyncSection } from "@/components/settings/sub-account-calendar-sync-section";
import { SubAccountWebhooksSection } from "@/components/settings/sub-account-webhooks-section";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserDoc, SubscriptionStatus } from "@/types";
import type { Contact } from "@/types/contacts";
import { getStage, type Deal } from "@/types/deals";

const PLAN_LABEL: Record<SubscriptionStatus, { label: string; tone: string }> =
  {
    active: {
      label: "Pro · Active",
      tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    },
    trialing: {
      label: "Pro · Trial",
      tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    },
    past_due: {
      label: "Pro · Past due",
      tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    canceled: {
      label: "Canceled",
      tone: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    },
    inactive: {
      label: "Free plan",
      tone: "bg-muted text-muted-foreground",
    },
  };

export default function SettingsPage() {
  const { user, role } = useAuth();
  const { subAccountId, agencyId, subAccount } = useSubAccount();
  const pipelineStages = usePipelineStages();
  const workspaceName = subAccount?.name ?? "this sub-account";
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    if (!user) return;
    getUserDoc(user.uid).then((d) => setProfile(d));
  }, [user]);

  useEffect(() => {
    if (!user || !agencyId) return;
    const unsub = subscribeToContacts(
      { agencyId, subAccountId },
      setContacts,
    );
    return () => unsub();
  }, [user, agencyId, subAccountId]);

  useEffect(() => {
    if (!user || !agencyId) return;
    const unsub = subscribeToDeals(
      { agencyId, subAccountId },
      setDeals,
    );
    return () => unsub();
  }, [user, agencyId, subAccountId]);

  const contactById = useMemo(
    () => new Map(contacts.map((contact) => [contact.id, contact])),
    [contacts],
  );

  function handleExportWorkspace() {
    if (contacts.length === 0 && deals.length === 0) {
      toast.error("No contacts or deals to export yet.");
      return;
    }

    const contactHeaders = [
      "name",
      "email",
      "phone",
      "company",
      "source",
      "tags",
      "pipelineStage",
      "createdAt",
    ];
    const contactRows = contacts.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.company,
      source: c.source,
      tags: c.tags ?? [],
      pipelineStage: c.pipelineStage ?? "",
      createdAt: toDate(c.createdAt)?.toISOString() ?? "",
    }));

    const dealHeaders = [
      "title",
      "value",
      "currency",
      "stage",
      "priority",
      "contactName",
      "contactEmail",
      "territoryId",
      "lostReason",
      "createdAt",
      "updatedAt",
      "stageChangedAt",
    ];
    const dealRows = deals.map((deal) => {
      const contact = contactById.get(deal.contactId);
      return {
        title: deal.title,
        value: deal.value,
        currency: deal.currency,
        stage: getStage(deal.stageId, pipelineStages).label,
        priority: deal.priority,
        contactName: contact?.name ?? "",
        contactEmail: contact?.email ?? "",
        territoryId: deal.territoryId ?? "",
        lostReason: deal.lostReason ?? "",
        createdAt: toDate(deal.createdAt)?.toISOString() ?? "",
        updatedAt: toDate(deal.updatedAt)?.toISOString() ?? "",
        stageChangedAt: toDate(deal.stageChangedAt)?.toISOString() ?? "",
      };
    });

    const stamp = new Date().toISOString().slice(0, 10);
    if (contactRows.length > 0) {
      const contactsCsv = serializeCsv(contactHeaders, contactRows);
      downloadCsv(`leadstack-contacts-${stamp}.csv`, contactsCsv);
    }
    if (dealRows.length > 0) {
      const dealsCsv = serializeCsv(dealHeaders, dealRows);
      window.setTimeout(() => {
        downloadCsv(`leadstack-deals-${stamp}.csv`, dealsCsv);
      }, 150);
    }
    toast.success(
      `Exported ${contactRows.length} contact${contactRows.length === 1 ? "" : "s"} and ${dealRows.length} deal${dealRows.length === 1 ? "" : "s"}.`,
    );
  }

  const plan = profile?.subscriptionStatus
    ? PLAN_LABEL[profile.subscriptionStatus]
    : PLAN_LABEL.inactive;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {workspaceName} · Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Workspace-level configuration for{" "}
          <strong className="text-foreground">{workspaceName}</strong>. For
          your personal profile / password, open{" "}
          <Link href="/me/settings" className="text-primary underline">
            Your account
          </Link>
          .
        </p>
      </div>

      <Tabs defaultValue="admin">
        <TabsList>
          <TabsTrigger value="admin">Admin</TabsTrigger>
          <TabsTrigger value="messaging">Messaging</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
          <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="import">Importer</TabsTrigger>
        </TabsList>

        {/* ---------- Admin: contact, branding, plan, members, territories,
            calendar, payments, data ---------- */}
        <TabsContent value="admin" className="mt-6 space-y-6">
          {/* Account contact — the human at the client this sub-account belongs to. */}
          <SubAccountContactSection />

          {/* Branding — the client's logo, used on quote/invoice emails, public
              link pages, and PDFs. Independent of agency-level branding. */}
          <SubAccountBrandingSection />

          {/* Subscription — admin only, and only on the AgentStack-branded
              deployment. Buyer clones (LANDING_VARIANT === "custom") collect
              payment off-system and provision sub-accounts by invite, so this
              panel is hidden there. */}
          {role === "admin" && LANDING_VARIANT === "leadstack" && (
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CreditCard className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Subscription</h2>
                  <p className="text-xs text-muted-foreground">
                    This sub-account&apos;s plan with the agency. Defaults to
                    free; upgrade unlocks higher limits + premium features.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${plan.tone}`}
                  >
                    {plan.label}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Roadmap
                  </span>
                </div>
                <span
                  title="Per-sub-account billing is on the roadmap. Coming with the Stripe Connect upgrade."
                  className="cursor-not-allowed"
                >
                  <Button size="sm" disabled className="pointer-events-none">
                    See plans
                  </Button>
                </span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Sub-account billing is on the roadmap — agencies will be able
                to set tiered plans (free / pro / etc.) and clients can upgrade
                from this card. Until then every sub-account is on the free
                plan.
              </p>
            </section>
          )}

          {/* Members — admins (and the agency owner) invite, promote, remove. */}
          <SubAccountMembersSection />

          {/* Territory Scoping — opt-in restriction pinning collaborators to
              the regions they cover. Off by default. */}
          <SubAccountTerritoriesSection />

          {/* Pipeline — rename + reorder deal stages (labels/order only;
              ids + won/lost terminals are fixed). */}
          <SubAccountPipelineSection />

          {/* Calendar sync — per-sub-account .ics subscription URL. */}
          <SubAccountCalendarSyncSection />

          {/* Payments — PayPal.me username for the Products + Invoices flow. */}
          <SubAccountPayPalSection />

          {/* Stripe Connect — v2 roadmap placeholder. */}
          <SubAccountStripeSection />

          {/* IDX Listings — realtor MLS search powered by the sub-account's
              own IDX Broker account. Self-gates: renders a "Locked by your
              agency" state until idxEnabledByAgency is on. */}
          <SubAccountIdxSection />

          {/* Add-ons — this IS real billing (unlike the roadmap "Subscription"
              card above, which is about agencies billing their own clients).
              Extends the agency's live AgentStack subscription directly. */}
          <SubAccountAddOnsSection />

          {/* Data export */}
          <section className="rounded-2xl border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Download className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Data</h2>
                <p className="text-xs text-muted-foreground">
                  Take your data with you, any time.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-4">
              <div>
                <p className="text-sm font-medium">Export workspace data</p>
                <p className="text-xs text-muted-foreground">
                  {contacts.length} contact{contacts.length === 1 ? "" : "s"} ·{" "}
                  {deals.length} deal{deals.length === 1 ? "" : "s"} ·
                  downloads both CSV files in one click
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportWorkspace}
                disabled={contacts.length === 0 && deals.length === 0}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Export CSVs
              </Button>
            </div>
          </section>
        </TabsContent>

        {/* ---------- Custom Fields: operator-defined fields on contacts + deals
            (the migration-target schema; also useful standalone) ---------- */}
        <TabsContent value="custom-fields" className="mt-6 space-y-6">
          <SubAccountCustomFieldsSection />
        </TabsContent>

        {/* ---------- Import: GoHighLevel migration wizard ---------- */}
        <TabsContent value="import" className="mt-6 space-y-6">
          <GhlImportWizard />
        </TabsContent>

        {/* ---------- Messaging: SMS/WhatsApp sender, email domain, reviews ---------- */}
        <TabsContent value="messaging" className="mt-6 space-y-6">
          {/* SMS — opt-in dedicated Twilio number (also hosts the WhatsApp sender). */}
          <SubAccountSmsSection />

          {/* A2P registration — guided 10DLC setup + manual carrier status tracking. */}
          <SubAccountA2pSection />

          {/* Facebook + Instagram inbox (beta) — self-gates: renders only when
              the agency flipped metaInboxEnabledByAgency on for this sub-account. */}
          <SubAccountMetaSection />

          {/* Email sending domain — opt-in dedicated Resend domain. */}
          <SubAccountEmailDomainSection />

          {/* Google reviews — SMS / WhatsApp review-request sends. */}
          <SubAccountGoogleReviewSection />

          {/* Daily briefing — once-a-day summary email, self-serve toggle. */}
          <SubAccountDailyBriefingSection />
        </TabsContent>

        {/* ---------- API: recipes, keys, webhooks ---------- */}
        <TabsContent value="api" className="mt-6 space-y-6">
          {/* Quick start — guided setup for the common integrations. */}
          <SubAccountApiRecipesSection />

          {/* API keys — programmatic access for Zapier, Make, custom pages. */}
          <SubAccountApiKeysSection />

          {/* Webhooks — outbound event delivery to subscriber URLs. */}
          <SubAccountWebhooksSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

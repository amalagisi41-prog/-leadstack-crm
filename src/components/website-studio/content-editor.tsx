"use client";

import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  normalizeAgentSiteContent,
  type AgentSiteCompliance,
  type AgentSiteContent,
  type AgentSiteListing,
  type AgentSiteTestimonial,
} from "@/types/agent-site";

const DEFAULT_COMPLIANCE: AgentSiteCompliance = {
  licenseStates: "",
  licenseNumber: "",
  privacyPolicyUrl: "",
  termsUrl: "",
  fairHousingStatement:
    "We are pledged to the letter and spirit of U.S. policy for the achievement of equal housing opportunity throughout the nation.",
  smsConsentEnabled: false,
  smsConsentDisclosure:
    "By providing your phone number, you agree to receive calls and text messages about your inquiry. Consent is not a condition of service. Message and data rates may apply. Reply STOP to opt out.",
};

/**
 * Manual brand + content editor — lets a subscriber directly modify every
 * field the AI Designer fills, add/remove featured listings + testimonials,
 * and save as a draft. Edits update the live preview instantly via onChange;
 * "Save draft" persists through the same content PATCH.
 */

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9"
        />
      )}
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border p-3">
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

export function ContentEditor({
  content,
  onChange,
  onSave,
  saving,
}: {
  content: AgentSiteContent;
  onChange: (c: AgentSiteContent) => void;
  onSave: (c: AgentSiteContent) => Promise<void>;
  saving: boolean;
}) {
  const [local, setLocal] = useState<AgentSiteContent>(() =>
    normalizeAgentSiteContent(content)
  );

  function set<K extends keyof AgentSiteContent>(
    key: K,
    value: AgentSiteContent[K]
  ) {
    const next = { ...local, [key]: value };
    setLocal(next);
    onChange(next); // live preview
  }

  function setListing(i: number, patch: Partial<AgentSiteListing>) {
    const listings = local.listings.map((l, idx) =>
      idx === i ? { ...l, ...patch } : l
    );
    set("listings", listings);
  }
  function setTestimonial(i: number, patch: Partial<AgentSiteTestimonial>) {
    const testimonials = local.testimonials.map((t, idx) =>
      idx === i ? { ...t, ...patch } : t
    );
    set("testimonials", testimonials);
  }
  function setCompliance<K extends keyof AgentSiteCompliance>(
    key: K,
    value: AgentSiteCompliance[K]
  ) {
    set("compliance", {
      ...DEFAULT_COMPLIANCE,
      ...(local.compliance ?? {}),
      [key]: value,
    });
  }

  const compliance = { ...DEFAULT_COMPLIANCE, ...(local.compliance ?? {}) };

  return (
    <div className="bg-card flex h-full flex-col rounded-2xl border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-semibold">Edit brand &amp; content</p>
        <Button
          size="sm"
          onClick={async () => {
            try {
              await onSave(local);
              toast.success("Draft saved.");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not save.");
            }
          }}
          disabled={saving}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save draft"}
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <Group title="Brand">
          <Field
            label="Agent name"
            value={local.agentName}
            onChange={(v) => set("agentName", v)}
          />
          <Field
            label="Title"
            value={local.title}
            onChange={(v) => set("title", v)}
            placeholder="REALTOR® · Luxury Specialist"
          />
          <Field
            label="Brokerage"
            value={local.brokerage}
            onChange={(v) => set("brokerage", v)}
          />
          <Field
            label="Logo URL"
            value={local.logoUrl}
            onChange={(v) => set("logoUrl", v)}
            placeholder="https://…"
          />
        </Group>

        <Group title="Hero">
          <Field
            label="Tagline / headline"
            value={local.tagline}
            onChange={(v) => set("tagline", v)}
          />
          <Field
            label="Hero image URL"
            value={local.heroImageUrl}
            onChange={(v) => set("heroImageUrl", v)}
            placeholder="https://…"
          />
          <Field
            label="Headshot URL"
            value={local.headshotUrl}
            onChange={(v) => set("headshotUrl", v)}
            placeholder="https://…"
          />
        </Group>

        <Group title="About">
          <Field
            label="Bio"
            value={local.bio}
            onChange={(v) => set("bio", v)}
            textarea
          />
          <Field
            label="Specialties (comma-separated)"
            value={local.specialties.join(", ")}
            onChange={(v) =>
              set(
                "specialties",
                v
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
        </Group>

        <Group title="Contact">
          <Field
            label="Phone"
            value={local.phone}
            onChange={(v) => set("phone", v)}
          />
          <Field
            label="Email"
            value={local.email}
            onChange={(v) => set("email", v)}
          />
          <Field
            label="Service areas"
            value={local.serviceAreas}
            onChange={(v) => set("serviceAreas", v)}
            placeholder="Fairfield County, CT"
          />
        </Group>

        <Group title="Social">
          <Field
            label="Instagram URL"
            value={local.instagram}
            onChange={(v) => set("instagram", v)}
          />
          <Field
            label="Facebook URL"
            value={local.facebook}
            onChange={(v) => set("facebook", v)}
          />
          <Field
            label="LinkedIn URL"
            value={local.linkedin}
            onChange={(v) => set("linkedin", v)}
          />
        </Group>

        {/* Listings */}
        <Group title="Featured listings">
          {local.listings.map((l, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">
                  Listing {i + 1}
                </span>
                <button
                  onClick={() =>
                    set(
                      "listings",
                      local.listings.filter((_, idx) => idx !== i)
                    )
                  }
                  className="text-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                className="h-8"
                placeholder="Title"
                value={l.title}
                onChange={(e) => setListing(i, { title: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  className="h-8"
                  placeholder="Price"
                  value={l.price}
                  onChange={(e) => setListing(i, { price: e.target.value })}
                />
                <Input
                  className="h-8"
                  placeholder="Status"
                  value={l.status}
                  onChange={(e) => setListing(i, { status: e.target.value })}
                />
              </div>
              <Input
                className="h-8"
                placeholder="Location"
                value={l.location}
                onChange={(e) => setListing(i, { location: e.target.value })}
              />
              <Input
                className="h-8"
                placeholder="Image URL"
                value={l.imageUrl}
                onChange={(e) => setListing(i, { imageUrl: e.target.value })}
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              set("listings", [
                ...local.listings,
                {
                  title: "",
                  price: "",
                  location: "",
                  imageUrl: "",
                  status: "For Sale",
                },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add listing
          </Button>
        </Group>

        {/* Testimonials */}
        <Group title="Testimonials">
          {local.testimonials.map((t, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs font-medium">
                  Testimonial {i + 1}
                </span>
                <button
                  onClick={() =>
                    set(
                      "testimonials",
                      local.testimonials.filter((_, idx) => idx !== i)
                    )
                  }
                  className="text-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                className="bg-background w-full rounded-md border px-2 py-1.5 text-sm"
                rows={2}
                placeholder="Quote"
                value={t.quote}
                onChange={(e) => setTestimonial(i, { quote: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  className="h-8"
                  placeholder="Author"
                  value={t.author}
                  onChange={(e) =>
                    setTestimonial(i, { author: e.target.value })
                  }
                />
                <Input
                  className="h-8"
                  placeholder="Detail"
                  value={t.detail}
                  onChange={(e) =>
                    setTestimonial(i, { detail: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              set("testimonials", [
                ...local.testimonials,
                { quote: "", author: "", detail: "" },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Add testimonial
          </Button>
        </Group>

        <Group title="Closing call-to-action">
          <Field
            label="CTA headline"
            value={local.ctaHeadline}
            onChange={(v) => set("ctaHeadline", v)}
          />
          <Field
            label="CTA subtext"
            value={local.ctaSubtext}
            onChange={(v) => set("ctaSubtext", v)}
            textarea
          />
        </Group>

        <Group title="Real estate compliance">
          <div className="grid grid-cols-2 gap-2">
            <Field
              label="Licensed state(s)"
              value={compliance.licenseStates}
              onChange={(value) => setCompliance("licenseStates", value)}
              placeholder="CT, MA"
            />
            <Field
              label="License number"
              value={compliance.licenseNumber}
              onChange={(value) => setCompliance("licenseNumber", value)}
            />
          </div>
          <Field
            label="Privacy Policy URL"
            value={compliance.privacyPolicyUrl}
            onChange={(value) => setCompliance("privacyPolicyUrl", value)}
            placeholder="https://…/privacy"
          />
          <Field
            label="Terms of Service URL"
            value={compliance.termsUrl}
            onChange={(value) => setCompliance("termsUrl", value)}
            placeholder="https://…/terms"
          />
          <Field
            label="Fair-housing statement"
            value={compliance.fairHousingStatement}
            onChange={(value) => setCompliance("fairHousingStatement", value)}
            textarea
          />
          <label className="flex items-start gap-2 rounded-lg border p-3 text-xs">
            <input
              type="checkbox"
              checked={compliance.smsConsentEnabled}
              onChange={(event) =>
                setCompliance("smsConsentEnabled", event.target.checked)
              }
              className="mt-0.5"
            />
            <span>
              This website collects phone numbers for SMS follow-up. Require
              standardized consent and STOP disclosures.
            </span>
          </label>
          {compliance.smsConsentEnabled ? (
            <Field
              label="SMS consent disclosure"
              value={compliance.smsConsentDisclosure}
              onChange={(value) => setCompliance("smsConsentDisclosure", value)}
              textarea
            />
          ) : null}
        </Group>

        <Group title="SEO">
          <p className="text-muted-foreground -mt-1 text-xs">
            Controls how this page appears in search results and social-media
            link previews.
          </p>
          <Field
            label={`Search title (${local.metaTitle.length}/60)`}
            value={local.metaTitle}
            onChange={(v) => set("metaTitle", v)}
            placeholder={
              local.agentName
                ? `${local.agentName} | ${local.title || "REALTOR®"}`
                : "Your name | Your title"
            }
          />
          <Field
            label={`Search description (${local.metaDescription.length}/155)`}
            value={local.metaDescription}
            onChange={(v) => set("metaDescription", v)}
            placeholder={
              local.tagline ||
              "A short, compelling summary of who you help and where."
            }
            textarea
          />
          <Field
            label="Social preview image URL"
            value={local.ogImageUrl}
            onChange={(v) => set("ogImageUrl", v)}
            placeholder={
              local.heroImageUrl || "https://… (defaults to your hero image)"
            }
          />
        </Group>

      </div>
    </div>
  );
}

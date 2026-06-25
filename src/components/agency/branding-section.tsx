"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Globe, Mail, Palette, Save } from "lucide-react";
import { toast } from "sonner";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/logo-mark";

const URL_RE = /^https?:\/\/.+/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export function BrandingSection() {
  const agency = useAgency();
  const [name, setName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [supportEmail, setSupportEmail] = useState<string>("");
  const [primaryDomain, setPrimaryDomain] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Hydrate the form once the agency doc resolves. We don't reset on every
  // change, so the operator's in-flight edits aren't blown away when the
  // snapshot tick fires from their own save.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!agency.loading && !hydrated) {
      setName(agency.name === "LeadStack" ? "" : agency.name);
      setLogoUrl(agency.logoUrl ?? "");
      setSupportEmail(agency.supportEmail ?? "");
      setPrimaryDomain(agency.primaryDomain ?? "");
      setHydrated(true);
    }
  }, [
    agency.loading,
    agency.name,
    agency.logoUrl,
    agency.supportEmail,
    agency.primaryDomain,
    hydrated,
  ]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedLogo = logoUrl.trim();
    const trimmedEmail = supportEmail.trim().toLowerCase();
    const trimmedDomain = primaryDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");

    if (!trimmedName) {
      toast.error("Agency name is required.");
      return;
    }
    if (trimmedLogo && !URL_RE.test(trimmedLogo)) {
      toast.error("Logo URL must start with http:// or https://.");
      return;
    }
    if (trimmedEmail && !EMAIL_RE.test(trimmedEmail)) {
      toast.error("Support email must be a valid email address.");
      return;
    }
    if (trimmedDomain && !DOMAIN_RE.test(trimmedDomain)) {
      toast.error("Primary domain must be a bare domain like example.com.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/agency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          logoUrl: trimmedLogo || null,
          supportEmail: trimmedEmail || null,
          primaryDomain: trimmedDomain || null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? "Could not save.");
      toast.success("Branding updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5 rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Palette className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Branding</h2>
          <p className="text-xs text-muted-foreground">
            What clients see in the sidebar, browser tab, AND the public
            landing page when LANDING_VARIANT is &ldquo;custom&rdquo;. Blank
            fields fall back to the defaults in src/config/landing.ts.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="agency-name">Agency name</Label>
        <Input
          id="agency-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Marketing Co."
          maxLength={80}
          required
        />
        <p className="text-[11px] text-muted-foreground">
          Sidebar wordmark, browser tab title, and the brand name across the
          public landing page.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="logo-url">Logo URL</Label>
        <Input
          id="logo-url"
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://yourcdn.com/agency-logo.svg"
        />
        <p className="text-[11px] text-muted-foreground">
          Public https URL pointing at your logo (SVG or PNG, transparent
          background works best). Renders in the sidebar at 24px tall. Leave
          blank to fall back to the LeadStack chevron mark.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="support-email">Support email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="support-email"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="hello@yourbrand.com"
            className="pl-8"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Used for &ldquo;Talk to us&rdquo; CTAs, the FAQ contact line, and
          the footer on the public landing page.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="primary-domain">Primary domain</Label>
        <div className="relative">
          <Globe className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="primary-domain"
            value={primaryDomain}
            onChange={(e) => setPrimaryDomain(e.target.value)}
            placeholder="yourbrand.com"
            className="pl-8"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Bare domain only — no https://, no trailing slash. Surfaced in the
          landing footer.
        </p>
      </div>

      {/* Live preview of the sidebar lockup. Mirrors what the dashboard
          chrome will render after save. */}
      <div className="rounded-xl border bg-background p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Sidebar preview
        </p>
        <div className="flex items-center gap-2 text-xl font-bold">
          {logoUrl.trim() && URL_RE.test(logoUrl.trim()) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl.trim()}
              alt={name || "Agency logo"}
              className="h-6 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <LogoMark size={20} idSuffix="-branding-preview" />
          )}
          <span className="truncate">{name || "Your agency"}</span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !hydrated}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

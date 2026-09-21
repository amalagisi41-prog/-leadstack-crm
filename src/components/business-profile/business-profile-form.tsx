"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  ArrowRight,
  Check,
  Eye,
  ExternalLink,
  Globe2,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  businessProfileCompleteness,
  compileBusinessProfilePrompt,
} from "@/lib/business-profile/compile";
import { openAskAssistant } from "@/components/dashboard/ask-assistant-panel";
import {
  MediaLibrary,
  type MediaAsset,
} from "@/components/media/media-library";
import {
  BRAND_VOICES,
  EMPTY_BUSINESS_PROFILE,
  SERVICE_SPECIALTIES,
  type BusinessProfileContent,
} from "@/types/business-profile";
import { readJson } from "@/lib/http/read-json";
import { GoogleOAuthImport } from "@/components/business-profile/google-oauth-import";

const MAX_LIST_ITEMS = 30;
const PROFILE_EXPORT_ALIASES: Record<string, keyof BusinessProfileContent> = {
  agent: "agentName",
  agentname: "agentName",
  name: "agentName",
  title: "title",
  brokerage: "brokerage",
  company: "brokerage",
  license: "licenseNumber",
  licensenumber: "licenseNumber",
  licensestate: "licenseStates",
  licensestates: "licenseStates",
  phone: "phone",
  telephone: "phone",
  email: "email",
  website: "website",
  serviceareas: "serviceAreas",
  specialties: "specialties",
  services: "services",
  bio: "bio",
  biography: "bio",
  clientpromise: "clientPromise",
  languages: "languages",
  testimonials: "testimonials",
};

function normalizeProfileExport(text: string): Partial<BusinessProfileContent> {
  const trimmed = text.trim();
  let entries: Array<[string, unknown]> = [];
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const source =
      parsed && typeof parsed.profile === "object" && parsed.profile !== null
        ? (parsed.profile as Record<string, unknown>)
        : parsed;
    entries = Object.entries(source);
  } catch {
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    entries = lines.map((line) => {
      const separator = line.indexOf("=") >= 0 ? line.indexOf("=") : line.indexOf(",");
      return separator > 0
        ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
        : ["", ""];
    });
  }

  const result: Partial<BusinessProfileContent> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = PROFILE_EXPORT_ALIASES[rawKey.toLowerCase().replace(/[^a-z]/g, "")];
    if (!key || rawValue == null) continue;
    const value = Array.isArray(rawValue)
      ? rawValue.join(", ")
      : String(rawValue).trim();
    if (!value) continue;
    if (key === "services") {
      result.services = value
        .split(/[,;|]/)
        .map((item) => item.trim().toLowerCase().replace(/\s+/g, "_") as BusinessProfileContent["services"][number])
        .filter((item) => SERVICE_SPECIALTIES.some((service) => service.id === item));
    } else {
      (result[key] as string) = value.slice(0, 4000);
    }
  }
  return result;
}

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
  aiField,
  onAssist,
  assisting,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  aiField?: keyof BusinessProfileContent;
  onAssist?: (field: keyof BusinessProfileContent, label: string) => void;
  assisting?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          {label}
        </span>
        {aiField && onAssist ? (
          <button
            type="button"
            disabled={assisting}
            onClick={(event) => {
              event.preventDefault();
              onAssist(aiField, label);
            }}
            className="flex items-center gap-1 text-[11px] font-medium text-pink-600 hover:text-pink-700 disabled:opacity-50"
          >
            {assisting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            AI assist
          </button>
        ) : null}
      </span>
      {children}
      {hint ? (
        <span className="text-muted-foreground mt-1 block text-[11px]">
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
    <section className="bg-card rounded-2xl border p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-0.5 mb-4 text-xs">{desc}</p>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function BusinessProfileForm() {
  const { subAccountId, saPath } = useSubAccount();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromWizard = searchParams.get("from") === "wizard";
  const connectionImport = searchParams.get("import")?.trim() ?? "";
  const [content, setContent] = useState<BusinessProfileContent>(
    EMPTY_BUSINESS_PROFILE
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [completeness, setCompleteness] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [assistingField, setAssistingField] = useState<
    keyof BusinessProfileContent | null
  >(null);
  const [mediaOpen, setMediaOpen] = useState<
    "logoUrl" | "headshotUrl" | "buyerGuideUrl" | "sellerGuideUrl" | null
  >(null);
  const [portalProfiles, setPortalProfiles] = useState({
    zillow: "",
    homes: "",
    realtor: "",
  });
  const [savingPortalProfiles, setSavingPortalProfiles] = useState(false);
  /**
   * The initial load failed, so `content` is still EMPTY_BUSINESS_PROFILE
   * rather than what's actually stored. Saving from this state PATCHes every
   * field as "" and wipes a real profile. Warning about it was not enough —
   * the button stayed armed and the destructive action stayed one click away.
   */
  const [loadFailed, setLoadFailed] = useState(false);

  // The Connections Center is the canonical place a realtor saves Zillow,
  // Homes.com and Realtor.com profiles. Carry those public URLs into this
  // review-only importer instead of making the operator paste them again.
  useEffect(() => {
    if (connectionImport) setImportUrl(connectionImport);
  }, [connectionImport]);

  useEffect(() => {
    if (!subAccountId) return;
    void fetch(`/api/sub-accounts/${subAccountId}/marketing/sources`)
      .then((res) => res.json())
      .then((data: { portalProfiles?: Partial<typeof portalProfiles> }) => {
        setPortalProfiles((current) => ({
          ...current,
          ...(data.portalProfiles ?? {}),
        }));
      })
      .catch(() => undefined);
  }, [subAccountId]);

  async function savePortalProfiles() {
    setSavingPortalProfiles(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/marketing/sources`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalProfiles }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        portalProfiles?: Partial<typeof portalProfiles>;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not save public profile links.");
      }
      setPortalProfiles((current) => ({
        ...current,
        ...(data.portalProfiles ?? {}),
      }));
      toast.success("Public profile links saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save public profile links.",
      );
    } finally {
      setSavingPortalProfiles(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/sub-accounts/${subAccountId}/business-profile`
        );
        const data = await readJson<{
          profile: BusinessProfileContent;
          importSourceUrl?: string;
          completeness: number;
        }>(res);
        if (!active) return;
        // An empty or failed body must not blank the form the operator is
        // looking at; leave the defaults and let them fill it in.
        if (!data.profile) {
          if (data.error) toast.error(data.error);
          return;
        }
        setContent({ ...EMPTY_BUSINESS_PROFILE, ...data.profile });
        setImportUrl(data.importSourceUrl ?? "");
        setCompleteness(data.completeness ?? 0);
      } catch {
        // Without this catch, a thrown fetch or parse rejected an un-awaited
        // IIFE: no toast, no error state, and `finally` still cleared the
        // spinner. The operator saw a blank Blueprint, assumed nothing had
        // been saved, retyped it, and overwrote real data on save. Say so.
        if (active) {
          setLoadFailed(true);
          toast.error(
            "We couldn't load your Business Blueprint. Reload before editing — saving now could overwrite what's already there."
          );
        }
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
    value: BusinessProfileContent[K]
  ) {
    setContent((c) => ({ ...c, [key]: value }));
  }

  async function assistField(
    field: keyof BusinessProfileContent,
    label: string
  ) {
    setAssistingField(field);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/business-profile/assist`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field, label, currentValue: content[field] }),
        }
      );
      const data = await readJson<{
        value?: string | null;
        message?: string;
        error?: string;
        recommended?: boolean;
      }>(res);
      if (!res.ok || (data.value !== null && typeof data.value !== "string"))
        throw new Error(data.error ?? "AI assist failed.");
      if (data.value === null) {
        toast.info(data.message ?? `${label} is not in the approved Blueprint yet.`);
        return;
      }
      set(field, data.value as BusinessProfileContent[typeof field]);
      toast.success(
        data.recommended
          ? `${label} filled with a recommended starting point. Review and customize before saving.`
          : `${label} drafted from your Business Blueprint. Review before saving.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI assist failed.");
    } finally {
      setAssistingField(null);
    }
  }

  const ai = (field: keyof BusinessProfileContent) => ({
    aiField: field,
    onAssist: assistField,
    assisting: assistingField === field,
  });

  function chooseMedia(
    field: "logoUrl" | "headshotUrl" | "buyerGuideUrl" | "sellerGuideUrl",
    asset: MediaAsset
  ) {
    if (
      (field === "logoUrl" || field === "headshotUrl") &&
      !asset.contentType.startsWith("image/")
    ) {
      toast.error("Choose an image file for this profile field.");
      return;
    }
    set(field, asset.url);
    setMediaOpen(null);
    toast.success(`${asset.name} selected.`);
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

  function setObjection(
    i: number,
    field: "objection" | "response",
    value: string
  ) {
    setContent((c) => {
      const objections = [...c.objections];
      objections[i] = { ...objections[i], [field]: value };
      return { ...c, objections };
    });
  }

  function setDocument(i: number, field: "label" | "url", value: string) {
    setContent((c) => {
      const documents = [...c.documents];
      documents[i] = { ...documents[i], [field]: value };
      return { ...c, documents };
    });
  }

  async function save(): Promise<boolean> {
    // Guard here rather than only on the buttons: there are three ways to
    // reach this (Save profile, Save & Continue, and the wizard hand-off),
    // and a blanking save is not something to leave to whether every call
    // site remembered to check.
    if (loadFailed) {
      toast.error(
        "Your Blueprint didn't load, so saving now would erase what's already stored. Reload the page first."
      );
      return false;
    }

    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/business-profile`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(content),
        }
      );
      const data = await readJson<{ completeness?: number }>(res);
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

  async function resetBlueprint() {
    const confirmed = window.confirm(
      "Start this Business Blueprint over? The current Blueprint will be archived for recovery. Contacts, conversations, domains, media, and all other workspace data will stay unchanged."
    );
    if (!confirmed) return;

    setResetting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/business-profile`,
        { method: "DELETE" }
      );
      const data = await readJson<{
        profile?: BusinessProfileContent;
        completeness?: number;
      }>(res);
      if (!res.ok || !data.profile)
        throw new Error(data.error ?? "Couldn't reset the Blueprint.");
      setContent({ ...EMPTY_BUSINESS_PROFILE, ...data.profile });
      setImportUrl("");
      setCompleteness(data.completeness ?? 0);
      toast.success(
        "Business Blueprint reset to a clean slate. The previous version was archived."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't reset the Blueprint."
      );
    } finally {
      setResetting(false);
    }
  }

  async function importPublicProfile() {
    const urls = (importUrl.match(/https?:\/\/[^\s]+/gi) ?? []).map((url) =>
      url.replace(/[),.;]+$/g, "")
    );
    if (urls.length === 0) {
      toast.error("Add your website or public business profile link first.");
      return;
    }
    if (urls.length > 5) {
      toast.error("Import up to five public profile links at a time.");
      return;
    }
    setImporting(true);
    try {
      let imported = 0;
      let finalCompleteness = 0;
      const failures: string[] = [];
      // Each source contributes verified facts. Keep the union of those
      // facts instead of letting the last response erase earlier fields.
      // Multi-source imports are additive. Start with the current draft so a
      // retry or a second/third link cannot erase approved facts or selected
      // media, then fill only fields that are still blank.
      let mergedProfile: BusinessProfileContent = { ...content, services: [...content.services] };
      const mergeImportedProfile = (
        incoming: BusinessProfileContent
      ): BusinessProfileContent => {
        const merged = { ...mergedProfile };
        for (const key of Object.keys(EMPTY_BUSINESS_PROFILE) as Array<
          keyof BusinessProfileContent
        >) {
          const value = incoming[key];
          if (key === "services") {
            merged.services = Array.from(
              new Set([
                ...(merged.services ?? []),
                ...incoming.services,
              ])
            );
          } else if (
            typeof value === "string" &&
            value.trim() &&
            !String(merged[key] ?? "").trim()
          ) {
            (merged[key] as string) = value;
          }
        }
        return merged;
      };
      for (const url of urls) {
        const res = await fetch(
          `/api/sub-accounts/${subAccountId}/business-profile/import`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, platform: "website" }),
          }
        );
        const data = await readJson<{
          profile?: BusinessProfileContent;
          importedProfile?: BusinessProfileContent;
          completeness?: number;
          extractionMode?: "ai" | "source-reader";
        }>(res);
        if (!res.ok || !data.profile) {
          failures.push(data.error ?? `Could not import ${url}.`);
          continue;
        }
        imported += 1;
        mergedProfile = mergeImportedProfile(
          data.importedProfile ?? data.profile
        );
        setContent(mergedProfile);
        finalCompleteness = Math.max(finalCompleteness, data.completeness ?? 0);
        setCompleteness(finalCompleteness);
      }
      if (imported === 0) {
        throw new Error(failures[0] ?? "Could not import those pages.");
      }
      if (failures.length > 0) {
        toast.warning(
          `${imported} ${imported === 1 ? "page" : "pages"} imported; ${failures.length} could not be read. Review the draft, then save.`
        );
      } else if (finalCompleteness === 100) {
        toast.success(
          `${imported} ${imported === 1 ? "page" : "pages"} imported from the public source. Review the verified details, then save to approve.`
        );
      } else {
        toast.warning(
          `${imported} ${imported === 1 ? "page" : "pages"} read, but only ${finalCompleteness}% of launch essentials were found. Review the missing fields or try another public profile.`
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function importProfileExport(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Keep the profile export under 2 MB.");
      return;
    }
    try {
      const imported = normalizeProfileExport(await file.text());
      const importedKeys = Object.keys(imported) as Array<keyof BusinessProfileContent>;
      if (importedKeys.length === 0) {
        toast.error(
          "No supported profile fields were found. Use a JSON, CSV, or field=value export with name, brokerage, contact, license, or service details."
        );
        return;
      }
      const next = { ...content, services: [...content.services] };
      for (const key of importedKeys) {
        if (key === "services") {
          next.services = Array.from(
            new Set([...next.services, ...(imported.services ?? [])])
          );
        } else if (!String(next[key] ?? "").trim()) {
          (next[key] as string) = String(imported[key] ?? "");
        }
      }
      setContent(next);
      setCompleteness(businessProfileCompleteness(next));
      toast.success(
        `${importedKeys.length} profile field${importedKeys.length === 1 ? "" : "s"} imported for review. Save the Blueprint when it looks right.`
      );
    } catch {
      toast.error(
        "We couldn't read that export. Use a JSON, CSV, or field=value file from the portal."
      );
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
        }
      );
      const data = await readJson<{ ok?: boolean }>(res);
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate.");
      toast.success(
        "AI persona generated and applied. Your assistants are ready."
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't generate.");
    } finally {
      setGenerating(false);
    }
  }

  const completionNextSteps = [
    !content.agentName.trim() ? "Add your name" : null,
    !content.brokerage.trim() ? "Add your brokerage" : null,
    !(content.phone.trim() || content.email.trim()) ? "Add a phone or email" : null,
    !content.serviceAreas.trim() ? "Add your service areas" : null,
    content.services.length === 0 ? "Choose at least one service" : null,
    !(content.bio.trim() || content.priceRanges.trim()) ? "Add a short bio or price range" : null,
    !content.website.trim() ? "Add your website" : null,
  ].filter((step): step is string => Boolean(step));

  function handleGoogleProfileImported(
    importedProfile: Partial<BusinessProfileContent>
  ) {
    setContent({ ...EMPTY_BUSINESS_PROFILE, ...importedProfile });
    toast.success(
      "Google Business Profile data imported. Review and save when ready."
    );
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading your profile…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="rounded-2xl border bg-gradient-to-br from-[#1b3d7a] to-[#16305f] p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            <h1 className="text-xl font-bold">Your Business Blueprint</h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            Preview what AgentStack knows
          </Button>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-blue-100/90">
          Tell us about your business once. This is your AgentStack Knowledge
          Base. Reach 100% with the launch essentials; add optional details
          later only when they are useful to your business.
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-blue-100/80">
            <span>Launch-ready essentials</span>
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

      {completeness < 100 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold">You’re not stuck — Zack can finish this with you.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Complete the next item below, or ask Zack for a step-by-step walkthrough. Your draft stays editable and nothing is published until you save it.
              </p>
              {completionNextSteps.length > 0 && (
                <p className="mt-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                  Next: {completionNextSteps.slice(0, 3).join(" · ")}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() =>
                openAskAssistant({
                  prompt: `I am setting up my Business Blueprint and it is ${completeness}% complete. Walk me through the next missing item one question at a time, then tell me exactly which field to fill in. Do not invent regulated facts such as license numbers or contact details.`,
                })
              }
            >
              <Sparkles className="mr-1.5 h-4 w-4" /> Ask Zack to guide me
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
          <div className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4" /> Blueprint launch essentials are complete.</div>
          <p className="mt-1 text-xs">Review your profile, then save it. Zack remains available from the header whenever you want help.</p>
        </section>
      )}

      <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900 dark:bg-blue-950/20">
        <div className="flex items-start gap-3">
          <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">
              Save time with AI-assisted setup
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              Paste your website, brokerage page, Zillow, Realtor.com, or
              Homes.com profile. AgentStack will prefill only details it can
              verify. Nothing is published, and you approve the draft before it
              becomes your trusted profile.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="url"
                value={importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
                placeholder="Paste one or more public website or profile links"
                className={`${input} flex-1`}
              />
              <Button
                type="button"
                onClick={importPublicProfile}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Use AI to prefill
              </Button>
            </div>
            <div className="mt-3 rounded-xl border border-dashed p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-medium">Have a portal export?</p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    Upload a JSON, CSV, TXT, or HTML export from Zillow,
                    Homes.com, or Realtor.com. It stays on this screen until
                    you review and save it.
                  </p>
                </div>
                <label className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Upload export
                  <input
                    type="file"
                    accept=".json,.csv,.txt,.html,text/plain,text/csv,application/json,text/html"
                    className="sr-only"
                    onChange={(event) => {
                      void importProfileExport(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <p className="text-muted-foreground mt-2 text-[11px]">
              License, brokerage, contact, and service-area details are never
              guessed. Complete any missing fields below for a consistent,
              search-ready profile.
            </p>
          </div>
        </div>
      </section>

      <Section
        title="Public profiles"
        desc="Save the public profile pages people use to find you. These are reference links, not integrations, and AgentStack does not sync with these sites."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {([
            ["zillow", "Zillow profile", "https://www.zillow.com/profile/..."],
            ["homes", "Homes.com profile", "https://www.homes.com/..."],
            ["realtor", "Realtor.com profile", "https://www.realtor.com/..."],
          ] as const).map(([key, label, placeholder]) => (
            <Field key={key} label={label}>
              <input
                type="url"
                className={input}
                value={portalProfiles[key]}
                onChange={(event) =>
                  setPortalProfiles((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                placeholder={placeholder}
              />
              {portalProfiles[key] ? (
                <a
                  href={portalProfiles[key]}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary underline"
                >
                  View public profile <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </Field>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={savePortalProfiles}
            disabled={savingPortalProfiles}
          >
            {savingPortalProfiles ? "Saving…" : "Save public profile links"}
          </Button>
        </div>
      </Section>

      {/* Google OAuth Import */}
      <GoogleOAuthImport onProfileImported={handleGoogleProfileImported} />

      {/* 1. Agent profile */}
      <Section title="1. About you" desc="Who you are and how leads reach you.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" {...ai("agentName")}>
            <input
              className={input}
              value={content.agentName}
              onChange={(e) => set("agentName", e.target.value)}
              placeholder="Jane Agent"
            />
          </Field>
          <Field label="Professional title" {...ai("title")}>
            <input
              className={input}
              value={content.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Realtor®, Broker Associate"
            />
          </Field>
          <Field label="Brokerage" {...ai("brokerage")}>
            <input
              className={input}
              value={content.brokerage}
              onChange={(e) => set("brokerage", e.target.value)}
              placeholder="Keller Williams Metro"
            />
          </Field>
          <Field label="Licensed in (states)" {...ai("licenseStates")}>
            <input
              className={input}
              value={content.licenseStates}
              onChange={(e) => set("licenseStates", e.target.value)}
              placeholder="NJ, NY"
            />
          </Field>
          <Field label="License number" {...ai("licenseNumber")}>
            <input
              className={input}
              value={content.licenseNumber}
              onChange={(e) => set("licenseNumber", e.target.value)}
              placeholder="1234567"
            />
          </Field>
          <Field label="Phone" {...ai("phone")}>
            <input
              className={input}
              value={content.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="(555) 123-4567"
            />
          </Field>
          <Field label="Email" {...ai("email")}>
            <input
              className={input}
              value={content.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="jane@brokerage.com"
            />
          </Field>
          <Field label="Website" {...ai("website")}>
            <input
              className={input}
              value={content.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://janesells.com"
            />
          </Field>
          <Field label="Languages spoken" {...ai("languages")}>
            <input
              className={input}
              value={content.languages}
              onChange={(e) => set("languages", e.target.value)}
              placeholder="English, Spanish"
            />
          </Field>
        </div>
      </Section>

      {/* 2. Brand DNA */}
      <Section
        title="2. Your brand DNA"
        desc="The identity every AI interaction, website, and marketing asset should carry — who you serve, how it should feel, and what you promise."
      >
        <Field
          label="Client experience"
          hint="The emotional experience every AI interaction should create."
          {...ai("clientExperience")}
        >
          <textarea
            rows={2}
            className={input}
            value={content.clientExperience}
            onChange={(e) => set("clientExperience", e.target.value)}
            placeholder="Every interaction should feel calm, confident, and personally attentive — like working with a trusted friend who happens to be a real estate expert."
          />
        </Field>
        <Field
          label="Ideal client profile"
          hint="Who this business serves — gives every AI response, website, and marketing asset a clear audience."
          {...ai("idealClientProfile")}
        >
          <textarea
            rows={2}
            className={input}
            value={content.idealClientProfile}
            onChange={(e) => set("idealClientProfile", e.target.value)}
            placeholder="Busy professionals age 30–45 buying their first or second home in Fairfield County — value-driven, not price-obsessed."
          />
        </Field>
        <Field
          label="Client promise"
          hint="One sentence. The commitment that stays consistent across every touchpoint."
          {...ai("clientPromise")}
        >
          <input
            className={input}
            value={content.clientPromise}
            onChange={(e) => set("clientPromise", e.target.value)}
            placeholder="Every client gets a same-day response and zero surprises at closing."
          />
        </Field>
      </Section>

      {/* 3. Market areas */}
      <Section
        title="3. Your market"
        desc="Where you work and what you specialize in — so the AI never sends a lead to the wrong town."
      >
        <Field
          label="Service areas (towns / neighborhoods)"
          hint="List the places you serve, separated by commas."
          {...ai("serviceAreas")}
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
          <Field label="Typical price ranges" {...ai("priceRanges")}>
            <input
              className={input}
              value={content.priceRanges}
              onChange={(e) => set("priceRanges", e.target.value)}
              placeholder="$400k–$1.2M"
            />
          </Field>
          <Field label="Specialties / niche" {...ai("specialties")}>
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
        title="4. What you offer"
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
        title="5. Your voice"
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
                <span className="text-muted-foreground mt-0.5 block text-[11px]">
                  {v.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* 5. Business rules */}
      <Section
        title="6. How you work"
        desc="Your availability and how you want leads handled."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business hours" {...ai("businessHours")}>
            <input
              className={input}
              value={content.businessHours}
              onChange={(e) => set("businessHours", e.target.value)}
              placeholder="Mon–Fri 9–6, Sat by appointment"
            />
          </Field>
          <Field label="Lead response preference" {...ai("responsePreference")}>
            <input
              className={input}
              value={content.responsePreference}
              onChange={(e) => set("responsePreference", e.target.value)}
              placeholder="Text first, then call within an hour"
            />
          </Field>
        </div>
        <Field
          label="Google Business Profile"
          hint="Optional: save your public profile link so Zack and your website workflows can reference it."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={`${input} flex-1`}
              type="url"
              value={content.googleBusinessProfileUrl}
              onChange={(event) => set("googleBusinessProfileUrl", event.target.value)}
              placeholder="https://g.page/your-business"
            />
            <Button
              type="button"
              variant="outline"
              render={
                <a
                  href="https://business.google.com/"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              Open Google Business Profile
            </Button>
          </div>
        </Field>
        <Field
          label="Hand off to a human when…"
          hint="When should the AI stop and get you involved?"
          {...ai("handoffRules")}
        >
          <textarea
            rows={2}
            className={input}
            value={content.handoffRules}
            onChange={(e) => set("handoffRules", e.target.value)}
            placeholder="The lead is ready to make an offer, or asks for legal/contract details."
          />
        </Field>
        <Field label="Alert me (escalate) when…" {...ai("escalationRules")}>
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
        title="7. Qualifying leads"
        desc="What the AI should find out to tell a serious lead from a tire-kicker."
      >
        <Field
          label="Qualification questions / criteria"
          {...ai("qualificationRules")}
        >
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
        title="8. Compliance guardrails"
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
          <Field
            label="Brokerage disclosure (if required)"
            {...ai("brokerageDisclosure")}
          >
            <input
              className={input}
              value={content.brokerageDisclosure}
              onChange={(e) => set("brokerageDisclosure", e.target.value)}
              placeholder="Jane Agent, Keller Williams — Lic# 1234567"
            />
          </Field>
          <Field label="Opt-out language" {...ai("optOutLanguage")}>
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
        title="9. Your assets"
        desc="Bio, links, and vendors the AI can reference and share."
      >
        <Field label="Short bio" {...ai("bio")}>
          <textarea
            rows={3}
            className={input}
            value={content.bio}
            onChange={(e) => set("bio", e.target.value)}
            placeholder="11 years serving Essex County. Top 1% in Maplewood. Known for…"
          />
        </Field>
        <Field label="Professional headshot">
          {content.headshotUrl ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={content.headshotUrl}
                alt="Professional headshot preview"
                className="h-16 w-16 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Uploaded headshot selected</p>
                <p className="text-xs text-muted-foreground">Stored in your approved Media Library.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set("headshotUrl", "")}
                aria-label="Remove professional headshot"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              No headshot uploaded yet. Upload one or choose an approved image from your Media Library.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setMediaOpen("headshotUrl")}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload or choose from Media Library
          </Button>
        </Field>
        <Field
          label="Brand logo sheet"
          hint="The approved logo reference your AI tools and website workflows should use."
        >
          {content.logoUrl ? (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={content.logoUrl}
                alt="Brand logo preview"
                className="h-16 w-16 rounded-md object-contain bg-white p-1"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Uploaded brand logo selected</p>
                <p className="text-xs text-muted-foreground">Stored in your approved Media Library.</p>
              </div>
              <Button
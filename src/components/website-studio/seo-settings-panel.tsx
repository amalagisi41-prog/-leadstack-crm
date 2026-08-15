"use client";

import { useState } from "react";
import { Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgentSiteContent } from "@/types/agent-site";

/**
 * Dedicated SEO settings surface — search title, description, and social
 * preview image for the published site. Kept as its own top-level tab
 * (mirroring a "Project Settings" style page) rather than buried inside
 * the content editor, since agents look for SEO as its own destination.
 *
 * Single-page site: one set of tags for the one published page. No
 * sitemap.xml here — that's only meaningful once multiple pages exist.
 */
export function SeoSettingsPanel({
  subAccountId,
  content,
  onSaved,
}: {
  subAccountId: string;
  content: AgentSiteContent;
  onSaved: (content: AgentSiteContent) => void;
}) {
  const [metaTitle, setMetaTitle] = useState(content.metaTitle);
  const [metaDescription, setMetaDescription] = useState(content.metaDescription);
  const [ogImageUrl, setOgImageUrl] = useState(content.ogImageUrl);
  const [saving, setSaving] = useState(false);

  const titlePreview =
    metaTitle.trim() ||
    `${content.agentName || "Your name"}${content.title ? ` — ${content.title}` : ""}`;
  const descriptionPreview =
    metaDescription.trim() || content.tagline || content.bio || "Your site's description will appear here.";
  const imagePreview = ogImageUrl.trim() || content.heroImageUrl;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/agent-site`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { metaTitle, metaDescription, ogImageUrl },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        site?: { content: AgentSiteContent };
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      if (data.site) onSaved(data.site.content);
      toast.success("SEO settings saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
          <Search className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-semibold tracking-tight">SEO</h2>
          <p className="text-muted-foreground text-xs">
            Controls how your published site appears in search results and social-media link previews.
          </p>
        </div>
      </div>

      <div className="bg-card space-y-4 rounded-2xl border p-5">
        <div className="space-y-1.5">
          <Label className="text-xs">Search title ({metaTitle.length}/60)</Label>
          <Input
            value={metaTitle}
            onChange={(e) => setMetaTitle(e.target.value)}
            placeholder={`${content.agentName || "Your name"} | ${content.title || "REALTOR®"}`}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Search description ({metaDescription.length}/155)</Label>
          <textarea
            value={metaDescription}
            onChange={(e) => setMetaDescription(e.target.value)}
            placeholder={content.tagline || "A short, compelling summary of who you help and where."}
            rows={3}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Social preview image URL</Label>
          <Input
            value={ogImageUrl}
            onChange={(e) => setOgImageUrl(e.target.value)}
            placeholder={content.heroImageUrl || "https://… (defaults to your hero image)"}
            className="h-9"
          />
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save SEO settings"}
        </Button>
      </div>

      {/* Search-result preview */}
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Search result preview
        </p>
        <div className="rounded-xl border bg-white p-4">
          <p className="truncate text-[13px] text-emerald-800">
            {typeof window !== "undefined" ? window.location.origin : ""}/agent/…
          </p>
          <p className="mt-0.5 truncate text-lg text-blue-800">{titlePreview}</p>
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">{descriptionPreview}</p>
        </div>
      </div>

      {/* Social preview */}
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Social link preview
        </p>
        <div className="overflow-hidden rounded-xl border bg-white">
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="" className="h-40 w-full object-cover" />
          ) : (
            <div className="text-muted-foreground flex h-40 items-center justify-center bg-slate-50 text-xs">
              No image set — add a hero image or a social preview image URL above
            </div>
          )}
          <div className="p-3">
            <p className="truncate text-sm font-semibold">{titlePreview}</p>
            <p className="text-muted-foreground line-clamp-1 text-xs">{descriptionPreview}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

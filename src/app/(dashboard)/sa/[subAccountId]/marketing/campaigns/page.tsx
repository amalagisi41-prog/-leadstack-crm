"use client";

import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileUp,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";
import type { IdxListingDoc } from "@/types/idx";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function readApiJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `The server returned an unexpected response (HTTP ${res.status}). Try a smaller export or retry in a moment.`
    );
  }
  return (await res.json()) as T;
}

export default function MarketingCampaignsPage() {
  const { subAccountId, isAdmin } = useSubAccount();
  const [mlsId, setMlsId] = useState("");
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({
    address: "",
    city: "",
    state: "",
    zip: "",
    price: "",
    beds: "",
    baths: "",
    sqft: "",
    propertyType: "",
    remarks: "",
    disclaimer: "",
    photos: "",
  });
  const [brief, setBrief] = useState<CampaignBriefDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [landingPageUrl, setLandingPageUrl] = useState<string | null>(null);
  const [approvedChannels, setApprovedChannels] = useState<string[]>([]);
  const [listing, setListing] = useState<IdxListingDoc | null>(null);
  const [editing, setEditing] = useState(false);

  async function createBrief(identifier = mlsId) {
    setLoading(true);
    try {
      const payload =
        manual || editing
          ? {
              ...form,
              mlsId: "",
              listingId: listing?.id,
              photos: form.photos.split(/\s*,\s*|\n/).filter(Boolean),
              price: Number(form.price),
              beds: Number(form.beds),
              baths: Number(form.baths),
              sqft: Number(form.sqft),
            }
          : { mlsId: identifier };
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/campaigns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await readApiJson<{
        ok?: boolean;
        error?: string;
        brief?: CampaignBriefDoc;
        listing?: IdxListingDoc;
      }>(res);
      if (!res.ok || !data.ok || !data.brief)
        throw new Error(data.error ?? "Could not build campaign brief.");
      setBrief(data.brief);
      if (data.listing) setListing(data.listing);
      setEditing(false);
      toast.success("Six-channel campaign draft built for review.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not build campaign brief."
      );
    } finally {
      setLoading(false);
    }
  }

  async function approveReadyDrafts() {
    if (!brief) return;
    setApproving(true);
    try {
      const channels = brief.brief.channels
        .filter(
          (draft) => draft.status === "ready" && draft.findings.length === 0
        )
        .map((draft) => draft.channel);
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/campaigns/${brief.listingId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channels }),
        }
      );
      const data = await readApiJson<{
        ok?: boolean;
        error?: string;
        landingPageUrl?: string | null;
        approvedChannels?: string[];
      }>(res);
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Could not approve campaign drafts.");
      setLandingPageUrl(data.landingPageUrl ?? null);
      setApprovedChannels(data.approvedChannels ?? []);
      toast.success("Ready campaign drafts approved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not approve campaign drafts."
      );
    } finally {
      setApproving(false);
    }
  }

  async function syncListings() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/idx/sync`, {
        method: "POST",
      });
      const data = await readApiJson<{
        ok?: boolean;
        error?: string;
        listingCount?: number;
      }>(res);
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Could not sync IDX listings.");
      toast.success(
        `IDX listings synced${typeof data.listingCount === "number" ? ` (${data.listingCount} active)` : ""}.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not sync IDX listings."
      );
    } finally {
      setSyncing(false);
    }
  }

  async function importListing(event: ChangeEvent<HTMLInputElement>) {
    const listingFile = event.target.files?.[0];
    if (!listingFile) return;
    setUploading(true);
    try {
      const totalBytes =
        listingFile.size +
        photoFiles.reduce((total, file) => total + file.size, 0);
      if (totalBytes > MAX_UPLOAD_BYTES) {
        throw new Error(
          "Keep the combined listing export and photos under 4 MB for this upload. Use a smaller export or fewer/compressed photos."
        );
      }
      const body = new FormData();
      body.set("listingFile", listingFile);
      photoFiles.forEach((file) => body.append("photos", file));
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/listing-upload`,
        { method: "POST", body }
      );
      const data = await readApiJson<{
        ok?: boolean;
        error?: string;
        listing?: IdxListingDoc;
      }>(res);
      if (!res.ok || !data.ok || !data.listing)
        throw new Error(data.error ?? "Could not import listing.");
      setMlsId(data.listing.id);
      setListing(data.listing);
      setForm({
        address: data.listing.address,
        city: data.listing.city,
        state: data.listing.state,
        zip: data.listing.zip,
        price: String(data.listing.price || ""),
        beds: String(data.listing.beds || ""),
        baths: String(data.listing.baths || ""),
        sqft: String(data.listing.sqft || ""),
        propertyType: data.listing.propertyType,
        remarks: data.listing.remarks,
        disclaimer: data.listing.disclaimer ?? "",
        photos: data.listing.photos.join("\n"),
      });
      await createBrief(data.listing.id);
      toast.success(
        `Imported ${data.listing.address} and built drafts across all channels.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not import listing."
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">MLS Campaign Panel</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Build reviewable, facts-only campaign drafts from the licensed IDX
          feed.
        </p>
      </div>
      <div className="bg-card rounded-2xl border p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="campaign-mls">IDX Broker listing number</Label>
            <Input
              id="campaign-mls"
              value={mlsId}
              onChange={(e) => setMlsId(e.target.value)}
              placeholder="Search synced featured/agent listings"
              disabled={manual}
            />
          </div>
          <Button
            onClick={() => createBrief()}
            disabled={!isAdmin || loading || (!manual && !mlsId.trim())}
          >
            {loading ? (
              "Building…"
            ) : (
              <>
                <Search className="mr-1 h-4 w-4" /> Find listing
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={syncListings}
            disabled={!isAdmin || syncing}
          >
            {syncing ? (
              <>
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> Syncing…
              </>
            ) : (
              <>
                <RefreshCw className="mr-1 h-4 w-4" /> Sync now
              </>
            )}
          </Button>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Enter the listing number returned by your connected IDX Broker
          featured/agent-listings feed. This integration cannot search the
          entire MLS.
        </p>
        <button
          type="button"
          className="mt-2 text-xs underline"
          onClick={() => setManual((v) => !v)}
        >
          {manual ? "Use synced IDX listing" : "Use guided manual entry"}
        </button>
        <div className="mt-4 rounded-xl border border-dashed p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                Import listing details and photos
              </p>
              <p className="text-muted-foreground text-xs">
                Upload a PDF, CSV, XLSX, JSON, TXT, or HTML export, plus up to
                20 JPG, PNG, WebP, or GIF photos. Combined upload limit: 4 MB.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="hover:bg-muted inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium">
                  <FileUp className="mr-2 h-4 w-4" />
                  {uploading ? "Importing…" : "Choose listing file"}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.csv,.xlsx,.xls,.json,.txt,.html"
                    onChange={importListing}
                    disabled={!isAdmin || uploading}
                  />
                </label>
                <label className="hover:bg-muted inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium">
                  <FileUp className="mr-2 h-4 w-4" />
                  {photoFiles.length
                    ? `${photoFiles.length} photos selected`
                    : "Choose photos"}
                  <input
                    type="file"
                    className="sr-only"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    onChange={(event) =>
                      setPhotoFiles(Array.from(event.target.files ?? []))
                    }
                    disabled={!isAdmin || uploading}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
        {(manual || editing) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["address", "Address"],
                ["city", "City"],
                ["state", "State"],
                ["zip", "ZIP"],
                ["price", "Price"],
                ["beds", "Beds"],
                ["baths", "Baths"],
                ["sqft", "Square feet"],
                ["propertyType", "Property type"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`manual-${key}`}>{label}</Label>
                <Input
                  id={`manual-${key}`}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="manual-remarks">Remarks</Label>
              <Textarea
                id="manual-remarks"
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="manual-photos">Photo URLs (one per line)</Label>
              <Textarea
                id="manual-photos"
                value={form.photos}
                onChange={(e) => setForm({ ...form, photos: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="manual-disclaimer">
                MLS disclaimer (verbatim)
              </Label>
              <Textarea
                id="manual-disclaimer"
                value={form.disclaimer}
                onChange={(e) =>
                  setForm({ ...form, disclaimer: e.target.value })
                }
              />
            </div>
            {editing && (
              <div className="flex gap-2 sm:col-span-2">
                <Button type="button" onClick={() => createBrief(listing?.id)}>
                  Save changes &amp; rebuild drafts
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      {brief && (
        <div className="space-y-4">
          <div className="bg-card rounded-2xl border p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="text-primary mt-0.5 h-5 w-5" />
              <div>
                <h2 className="font-semibold">{brief.brief.title}</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  {brief.brief.description}
                </p>
                <p className="mt-2 text-xs">
                  Boost schedule: {brief.brief.boostTier ?? "not eligible yet"}
                  {brief.brief.daysOnMarket == null
                    ? " · days on market unavailable"
                    : ` · ${brief.brief.daysOnMarket} days on market`}
                </p>
              </div>
            </div>
            {brief.brief.dataGaps.length > 0 && (
              <p className="mt-4 text-xs text-amber-700">
                Data gaps (not invented): {brief.brief.dataGaps.join(", ")}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                onClick={approveReadyDrafts}
                disabled={!isAdmin || approving}
              >
                {approving ? "Approving…" : "Approve ready drafts"}
              </Button>
              {listing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(true)}
                  disabled={editing}
                >
                  Edit listing &amp; rebuild
                </Button>
              )}
              {landingPageUrl && (
                <a
                  className="text-sm underline"
                  href={landingPageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View approved landing page
                </a>
              )}
            </div>
          </div>
          <div className="bg-card rounded-2xl border p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">LSEO &amp; SERP strategy</h2>
                <p className="text-muted-foreground text-xs">
                  Guidance for local discoverability using verified facts only.
                </p>
              </div>
              <span className="bg-muted rounded-full px-3 py-1 text-sm font-medium">
                {brief.brief.lseo.score}/100 readiness
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  Search preview
                </p>
                <p className="mt-1 text-sm font-medium">
                  {brief.brief.lseo.searchTitle}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {brief.brief.lseo.metaDescription}
                </p>
                <p className="mt-3 text-xs">
                  <span className="font-medium">Primary query:</span>{" "}
                  {brief.brief.lseo.primaryQuery}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  Recommended next steps
                </p>
                <ul className="text-muted-foreground mt-1 list-disc space-y-1 pl-4 text-xs">
                  {brief.brief.lseo.recommendations.map((recommendation) => (
                    <li key={recommendation}>{recommendation}</li>
                  ))}
                </ul>
              </div>
            </div>
            {brief.brief.lseo.blockers.length > 0 && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-medium">Approval blockers</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {brief.brief.lseo.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {brief.brief.images.length > 0 && (
            <div className="bg-card rounded-2xl border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">Listing photos</h2>
                  <p className="text-muted-foreground text-xs">
                    Uploaded photos are attached to this property and available
                    for the visual layouts.
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">
                  {brief.brief.images.length} photos
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {brief.brief.images.map((image, index) => (
                  <img
                    key={`${image}-${index}`}
                    src={image}
                    alt={`${brief.brief.address} photo ${index + 1}`}
                    className="aspect-[4/3] w-full rounded-lg border object-cover"
                  />
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {brief.brief.channels.map((draft) => (
              <div
                key={draft.channel}
                className="bg-card rounded-xl border p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium capitalize">{draft.channel}</h3>
                  <span className="text-muted-foreground text-xs">
                    {draft.approval}
                  </span>
                </div>
                <p className="mt-2 text-sm">{draft.body}</p>
                {draft.findings.length > 0 && (
                  <p className="mt-2 flex gap-1 text-xs text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Review:{" "}
                    {draft.findings.join(", ")}
                  </p>
                )}
                <p className="text-muted-foreground mt-2 text-[11px]">
                  Status: {draft.status} · audited approval required
                </p>
              </div>
            ))}
          </div>
          {approvedChannels.length > 0 && (
            <div className="bg-card rounded-2xl border p-5">
              <div>
                <h2 className="font-semibold">
                  Visual layouts ready for publishing
                </h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  Each approved channel is paired with listing photography, its
                  caption, and extracted hashtags.
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {brief.brief.channels
                  .filter((draft) => approvedChannels.includes(draft.channel))
                  .map((draft, index) => {
                    const hashtags = draft.body.match(/#[A-Za-z0-9_-]+/g) ?? [];
                    const image =
                      brief.brief.images[index % brief.brief.images.length];
                    return (
                      <div
                        key={`visual-${draft.channel}`}
                        className="bg-background overflow-hidden rounded-xl border"
                      >
                        {image && (
                          <img
                            src={image}
                            alt={`${draft.channel} visual for ${brief.brief.address}`}
                            className="aspect-[4/3] w-full object-cover"
                          />
                        )}
                        <div className="p-4">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium capitalize">
                              {draft.channel}
                            </h3>
                            <span className="text-xs text-green-700">
                              Approved
                            </span>
                          </div>
                          <p className="mt-2 text-sm">{draft.body}</p>
                          <p className="text-muted-foreground mt-3 text-xs">
                            <span className="text-foreground font-medium">
                              Hashtags:
                            </span>{" "}
                            {hashtags.length
                              ? hashtags.join(" ")
                              : "None required for this channel"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type IdxListingShape = { id: string; address: string };

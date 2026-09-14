"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle2,
  FileUp,
  Link2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type {
  CampaignBriefDoc,
  CampaignChannel,
  CampaignWorkflowStep,
} from "@/types/marketing-campaigns";
import type { IdxListingDoc, ListingMarketingStatus } from "@/types/idx";

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

function addressSeed(value: string) {
  const clean = value.trim();
  const match = clean.match(
    /^(.+?)(?:,\s*|\s+)([A-Za-z .'-]+?)[,\s]+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/i
  );
  if (!match) return { address: clean, city: "", state: "", zip: "" };
  return {
    address: match[1].trim(),
    city: match[2].trim(),
    state: match[3].toUpperCase(),
    zip: match[4],
  };
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
  const [decliningChannel, setDecliningChannel] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [listingFile, setListingFile] = useState<File | null>(null);
  const [landingPageUrl, setLandingPageUrl] = useState<string | null>(null);
  const [approvedChannels, setApprovedChannels] = useState<string[]>([]);
  const [listing, setListing] = useState<IdxListingDoc | null>(null);
  const [editing, setEditing] = useState(false);
  const [generateBrochure, setGenerateBrochure] = useState(false);
  const [brochureUrl, setBrochureUrl] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [channelAvailability, setChannelAvailability] = useState<Record<
    CampaignChannel,
    { configured: boolean; publishable: boolean }
  > | null>(null);
  const [workflowStep, setWorkflowStep] =
    useState<CampaignWorkflowStep>("create");
  const [schedulePlan, setSchedulePlan] = useState<
    Partial<Record<CampaignChannel, string | null>>
  >({});
  const [zillow, setZillow] = useState({ profileUrl: "", listingUrl: "" });
  const [savingZillow, setSavingZillow] = useState(false);
  const [pastedMlsDetails, setPastedMlsDetails] = useState("");
  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/marketing/campaigns`)
      .then((res) =>
        readApiJson<{
          channelAvailability?: Record<
            CampaignChannel,
            { configured: boolean; publishable: boolean }
          >;
        }>(res)
      )
      .then((data) => {
        setChannelAvailability(data.channelAvailability ?? null);
      })
      .catch(() => undefined);
    fetch(`/api/sub-accounts/${subAccountId}/marketing/sources`)
      .then((res) =>
        readApiJson<{
          zillow?: { profileUrl?: string | null; listingUrl?: string | null };
        }>(res)
      )
      .then((data) =>
        setZillow({
          profileUrl: data.zillow?.profileUrl ?? "",
          listingUrl: data.zillow?.listingUrl ?? "",
        })
      )
      .catch(() => undefined);
  }, [subAccountId]);

  useEffect(() => {
    if (!subAccountId || typeof window === "undefined") return;
    const listingId = new URLSearchParams(window.location.search).get(
      "listing"
    );
    if (!listingId) return;
    let current = true;
    void fetch(
      `/api/sub-accounts/${subAccountId}/marketing/campaigns/${listingId}/workspace`
    )
      .then(async (response) => {
        const data = (await readApiJson<{
          brief?: CampaignBriefDoc;
          listing?: IdxListingDoc | null;
          error?: string;
        }>(response)) as {
          brief?: CampaignBriefDoc;
          listing?: IdxListingDoc | null;
          error?: string;
        };
        if (!response.ok || !data.brief) {
          throw new Error(
            data.error ?? "Could not open this property campaign."
          );
        }
        return data;
      })
      .then((data) => {
        if (!current || !data.brief) return;
        setBrief(data.brief);
        setListing(data.listing ?? null);
        setMlsId(data.listing?.address ?? data.brief.listingId);
        setApprovedChannels(data.brief.approvedChannels);
        setLandingPageUrl(
          data.brief.approvedChannels.includes("landingPage")
            ? `/campaign/${subAccountId}/${data.brief.listingId}`
            : null
        );
        setWorkflowStep(
          data.brief.workflowStep ??
            (data.brief.approvedChannels.length ? "optimize" : "create")
        );
        setSchedulePlan(data.brief.schedulePlan ?? {});
      })
      .catch((error) => {
        if (current) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not open this property campaign."
          );
        }
      });
    return () => {
      current = false;
    };
  }, [subAccountId]);

  async function saveZillowLinks() {
    setSavingZillow(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/sources`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(zillow),
        }
      );
      const data = await readApiJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Could not save Zillow links.");
      toast.success("Zillow source links saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save Zillow links."
      );
    } finally {
      setSavingZillow(false);
    }
  }

  async function setWorkflow(next: CampaignWorkflowStep) {
    if (!brief) return;
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/marketing/campaigns/${brief.listingId}/workflow`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: next, schedulePlan }),
      }
    );
    const data = await readApiJson<{ ok?: boolean; error?: string }>(res);
    if (!res.ok || !data.ok)
      throw new Error(data.error ?? "Could not update campaign workflow.");
    setWorkflowStep(next);
    toast.success(
      next === "archive" ? "Campaign archived." : `Campaign moved to ${next}.`
    );
  }

  async function saveChannelDraft(channel: string) {
    if (!brief || !editingBody.trim()) return;
    setSavingDraft(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/campaigns/${brief.listingId}/drafts`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, body: editingBody }),
        }
      );
      const data = await readApiJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Could not save draft.");
      await createBrief(brief.listingId);
      setApprovedChannels([]);
      setEditingChannel(null);
      toast.success("Draft saved for review.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save draft."
      );
    } finally {
      setSavingDraft(false);
    }
  }

  async function updateListingStatus(status: ListingMarketingStatus) {
    if (!listing) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(
        "/api/sub-accounts/" +
          subAccountId +
          "/marketing/listings/" +
          listing.id +
          "/status",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const data = await readApiJson<{
        ok?: boolean;
        error?: string;
        listing?: IdxListingDoc;
        brief?: CampaignBriefDoc | null;
      }>(res);
      if (!res.ok || !data.ok || !data.listing)
        throw new Error(data.error ?? "Could not update listing status.");
      setListing(data.listing);
      if (data.brief) {
        setBrief(data.brief);
        setApprovedChannels([]);
        setLandingPageUrl(null);
      }
      toast.success("Listing status updated and campaign drafts rebuilt.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update listing status."
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function createBrief(identifier = mlsId) {
    setLoading(true);
    try {
      const useManual = editing || (!identifier.trim() && manual);
      const payload = useManual
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
        code?: string;
        brief?: CampaignBriefDoc;
        listing?: IdxListingDoc;
      }>(res);
      if (
        (res.status === 404 && data.code === "IDX_LISTING_NOT_IN_FEED") ||
        (res.status === 409 && data.code === "IDX_SEARCH_NOT_CONNECTED")
      ) {
        setManual(true);
        const seed = addressSeed(identifier);
        setForm((current) => ({
          ...current,
          address: current.address || seed.address,
          city: current.city || seed.city,
          state: current.state || seed.state,
          zip: current.zip || seed.zip,
        }));
        toast.warning(
          data.code === "IDX_SEARCH_NOT_CONNECTED"
            ? "IDX search is not connected for this workspace. Use the verified MLS detail, upload the MLS report, or complete the guided entry below."
            : seed.city
              ? "This IDX account does not expose that listing. Its address has been placed into guided entry below—add the verified facts or paste the full MLS detail."
              : "This IDX account does not expose that listing. Paste the complete MLS detail or use guided entry below."
        );
        return;
      }
      if (!res.ok || !data.ok || !data.brief)
        throw new Error(data.error ?? "Could not build campaign brief.");
      setBrief(data.brief);
      if (data.listing) setListing(data.listing);
      setEditing(false);
      setWorkflowStep("optimize");
      toast.success("Property campaign draft built for review.");
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

  async function approveDrafts(requestedChannels?: string[]) {
    if (!brief) return;
    setApproving(true);
    try {
      const channels = requestedChannels ?? brief.brief.channels
        .filter(
          (draft) => draft.status === "ready" && draft.findings.length === 0
        )
        .map((draft) => draft.channel);
      if (channels.length === 0)
        throw new Error("No channel is ready for approval yet.");
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
      toast.success(
        requestedChannels?.length === 1
          ? `${requestedChannels[0]} draft approved.`
          : "Ready campaign drafts approved."
      );
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

  const approveReadyDrafts = () => approveDrafts();

  async function declineDraft(channel: string) {
    if (!brief || !declineReason.trim()) {
      toast.error("Add a reason so the next revision is clear.");
      return;
    }
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/campaigns/${brief.listingId}/decline`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel, reason: declineReason.trim() }),
        }
      );
      const data = await readApiJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Could not record the decline.");
      setApprovedChannels((current) => current.filter((item) => item !== channel));
      setDecliningChannel(null);
      setDeclineReason("");
      toast.success("Decline recorded. Revise the draft, then submit it again.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not record the decline."
      );
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

  async function importListing(source = listingFile) {
    if (!source) return;
    setUploading(true);
    try {
      const totalBytes =
        source.size + photoFiles.reduce((total, file) => total + file.size, 0);
      if (totalBytes > MAX_UPLOAD_BYTES) {
        throw new Error(
          "Keep the combined listing export and photos under 4 MB for this upload. Use a smaller export or fewer/compressed photos."
        );
      }
      const body = new FormData();
      body.set("listingFile", source);
      photoFiles.forEach((file) => body.append("photos", file));
      body.set("generateBrochure", String(generateBrochure));
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/listing-upload`,
        { method: "POST", body }
      );
      const data = await readApiJson<{
        ok?: boolean;
        error?: string;
        listing?: IdxListingDoc;
        mediaPackage?: { brochureUrl?: string | null };
      }>(res);
      if (!res.ok || !data.ok || !data.listing)
        throw new Error(data.error ?? "Could not import listing.");
      setMlsId(data.listing.id);
      setListing(data.listing);
      setBrochureUrl(data.mediaPackage?.brochureUrl ?? null);
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
      setListingFile(null);
    }
  }

  async function importPastedMlsDetails() {
    const pasted = pastedMlsDetails.trim();
    if (!pasted) return;
    if (/^\d{6,}$/.test(pasted)) {
      toast.error(
        "An MLS number alone cannot create a property. Copy and paste the full SmartMLS detail (address, city/state/ZIP, price, beds, baths, and remarks), or use the quick listing form below."
      );
      return;
    }
    const source = new File([pasted], "smartmls-listing.txt", {
      type: "text/plain",
    });
    await importListing(source);
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Property marketing workflow</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              One property, one source of truth, one approval trail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                "create",
                "optimize",
                "schedule",
                "archive",
              ] as CampaignWorkflowStep[]
            ).map((step, index) => (
              <button
                key={step}
                type="button"
                className={`rounded-full border px-3 py-1.5 text-xs ${workflowStep === step ? "bg-primary text-primary-foreground" : "bg-background"}`}
                onClick={() =>
                  brief &&
                  setWorkflow(step).catch((error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not update campaign workflow."
                    )
                  )
                }
                disabled={!brief || !isAdmin}
              >
                {index + 1}. {step[0].toUpperCase() + step.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {workflowStep === "archive" && brief && (
          <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
            <Archive className="h-4 w-4" /> Archived safely. The property
            folder, drafts, approvals, and schedule remain available.
          </p>
        )}
        {brief && workflowStep === "create" && (
          <div className="bg-muted/50 mt-4 rounded-xl p-4 text-sm">
            <p className="font-medium">Create: confirm the source record</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Verify the address, price, required facts, source status, and
              photos before generating channel drafts. Missing items are named
              below; AgentStack will not invent them.
            </p>
          </div>
        )}
        {brief && workflowStep === "optimize" && (
          <div className="bg-muted/50 mt-4 rounded-xl p-4 text-sm">
            <p className="font-medium">Optimize: review each channel</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Edit copy where needed, resolve every compliance finding, then
              approve channels individually. Approval is recorded per channel
              and does not claim that an unconnected channel was published.
            </p>
          </div>
        )}
      </div>
      <div className="bg-card rounded-2xl border p-5">
        <div className="flex items-start gap-3">
          <Link2 className="text-primary mt-0.5 h-5 w-5" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Listing sources</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              MLS/official broker data stays authoritative. Zillow links are
              kept with the property for reference and distribution; they do not
              replace verified MLS facts.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium">Zillow listing reference</p>
                <Input
                  className="mt-2"
                  value={zillow.listingUrl}
                  onChange={(e) =>
                    setZillow({ ...zillow, listingUrl: e.target.value })
                  }
                  placeholder="https://www.zillow.com/..."
                  aria-label="Zillow listing URL"
                />
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs font-medium">Link profile</p>
                <Input
                  className="mt-2"
                  value={zillow.profileUrl}
                  onChange={(e) =>
                    setZillow({ ...zillow, profileUrl: e.target.value })
                  }
                  placeholder="https://www.zillow.com/profile/..."
                  aria-label="Zillow profile URL"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={saveZillowLinks}
                disabled={!isAdmin || savingZillow}
              >
                {savingZillow ? "Saving…" : "Save Zillow references"}
              </Button>
              <span className="text-muted-foreground text-[11px]">
                Paste MLS details or upload an export below to create the
                property—Zillow links alone cannot create a verified record.
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-card rounded-2xl border p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1 space-y-1.5">
            <Label htmlFor="campaign-mls">
              IDX listing ID or property address
            </Label>
            <Input
              id="campaign-mls"
              value={mlsId}
              onChange={(e) => setMlsId(e.target.value)}
              placeholder="e.g. 303 Weed Avenue, Stamford, CT"
              disabled={editing}
            />
          </div>
          <Button
            onClick={() => createBrief()}
            disabled={!isAdmin || loading || !mlsId.trim()}
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
          Search the connected IDX feed by ID or address. If SmartMLS does not
          return the listing through IDX, paste the verified MLS detail below or
          upload its report—your search field remains available.
        </p>
        <div className="bg-muted/30 mt-4 rounded-xl border p-3">
          <p className="text-xs font-medium">Your property workspaces</p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Open Properties to manage a listing’s details, assets, marketing
            drafts, and activity in one place.
          </p>
          <a
            className="text-primary mt-2 inline-flex text-xs font-medium underline"
            href={`/sa/${subAccountId}/properties`}
          >
            Open Properties
          </a>
        </div>
        {channelAvailability && (
          <div className="bg-muted/30 mt-4 rounded-xl border p-3">
            <p className="text-xs font-medium">Distribution channels</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                Object.entries(channelAvailability) as Array<
                  [
                    CampaignChannel,
                    { configured: boolean; publishable: boolean },
                  ]
                >
              ).map(([channel, availability]) => (
                <span
                  key={channel}
                  className="bg-background rounded-full border px-2.5 py-1 text-[11px]"
                >
                  <span className="font-medium capitalize">
                    {channel === "googleBusiness" ? "Google Business" : channel}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ·{" "}
                    {availability.publishable
                      ? "Publish ready"
                      : availability.configured
                        ? "Draft / export"
                        : "Not connected"}
                  </span>
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              <a
                className="underline"
                href={`/sa/${subAccountId}/dashboard/settings`}
              >
                Connect Facebook &amp; Instagram
              </a>
              <a
                className="underline"
                href={`/sa/${subAccountId}/business-profile`}
              >
                Set up Email &amp; Google Business
              </a>
              <a className="underline" href={`/sa/${subAccountId}/connect`}>
                Open Connections
              </a>
              <span className="text-muted-foreground">
                LinkedIn and TikTok drafts are kept here for export until their
                publishing integrations are connected.
              </span>
            </div>
          </div>
        )}
        {brief && workflowStep === "schedule" && (
          <div className="bg-muted/30 mt-4 rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <p className="text-xs font-medium">Set campaign calendar</p>
            </div>
            <p className="text-muted-foreground mt-1 text-[11px]">
              Choose dates for every channel in one campaign calendar. Connected
              channels can publish after approval; unsupported channels remain
              export-ready drafts.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {brief.brief.channels
                .map((draft) => (
                  <label key={draft.channel} className="text-xs">
                    <span className="capitalize">
                      {draft.channel === "googleBusiness"
                        ? "Google Business"
                        : draft.channel}
                    </span>
                    <span className="text-muted-foreground ml-1">
                      {channelAvailability?.[draft.channel]?.publishable
                        ? "· connected"
                        : "· draft/export"}
                    </span>
                    <Input
                      className="mt-1"
                      type="datetime-local"
                      value={schedulePlan[draft.channel] ?? ""}
                      onChange={(e) =>
                        setSchedulePlan({
                          ...schedulePlan,
                          [draft.channel]: e.target.value || null,
                        })
                      }
                    />
                  </label>
                ))}
            </div>
            <Button
              className="mt-3"
              size="sm"
              onClick={() =>
                setWorkflow("schedule").catch((error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not save calendar."
                  )
                )
              }
              disabled={!isAdmin}
            >
              Save campaign calendar
            </Button>
          </div>
        )}
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
              <p className="text-muted-foreground mt-1 text-xs">
                All listings use the shared WordPress{" "}
                <code>single-cpg_listing.php</code> template, including the
                optional brochure.
              </p>
              <div className="bg-background mt-3 rounded-lg border p-3">
                <Label htmlFor="paste-smartmls" className="text-xs font-medium">
                  Paste SmartMLS details
                </Label>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Copy the complete verified SmartMLS detail—not only the MLS
                  number—and AgentStack will create the property record. This is
                  the fastest route when IDX does not expose the listing.
                </p>
                <Textarea
                  id="paste-smartmls"
                  className="mt-2"
                  value={pastedMlsDetails}
                  onChange={(event) => setPastedMlsDetails(event.target.value)}
                  rows={4}
                  placeholder="Paste the MLS listing detail, including the address, price, beds, baths, square feet, remarks, and Listing ID."
                />
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  onClick={importPastedMlsDetails}
                  disabled={!isAdmin || uploading || !pastedMlsDetails.trim()}
                >
                  {uploading ? "Importing…" : "Create from pasted MLS details"}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="hover:bg-muted inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium">
                  <FileUp className="mr-2 h-4 w-4" />
                  {uploading ? "Importing…" : "Choose listing file"}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.csv,.xlsx,.xls,.json,.txt,.html"
                    onChange={(event) =>
                      setListingFile(event.target.files?.[0] ?? null)
                    }
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
                <Button
                  type="button"
                  onClick={() => importListing()}
                  disabled={!isAdmin || uploading || !listingFile}
                >
                  {uploading ? "Importing…" : "Import listing + photos"}
                </Button>
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={generateBrochure}
                  onChange={(event) =>
                    setGenerateBrochure(event.target.checked)
                  }
                  disabled={!isAdmin || uploading}
                />
                Generate a one-page brochure using the shared listing template
              </label>
              {brochureUrl && (
                <a
                  className="mt-2 inline-block text-xs underline"
                  href={brochureUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open property brochure
                </a>
              )}
              {(listingFile || photoFiles.length > 0) && (
                <p className="text-muted-foreground mt-2 text-xs">
                  {listingFile ? listingFile.name : "No listing file selected"}
                  {photoFiles.length > 0
                    ? ` · ${photoFiles.length} photo${photoFiles.length === 1 ? "" : "s"} ready`
                    : " · Add photos before importing"}
                </p>
              )}
            </div>
          </div>
        </div>
        {(manual || editing) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {manual && !editing && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs sm:col-span-2">
                <p className="font-medium">Guided verified entry</p>
                <p className="mt-1 text-muted-foreground">
                  Enter the facts from the SmartMLS detail or broker-approved
                  report. AgentStack will save this as a guided-entry property
                  record—not as an MLS sync—and open its property workspace.
                </p>
              </div>
            )}
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
            {manual && !editing && (
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  type="button"
                  onClick={() => createBrief("")}
                  disabled={!isAdmin || loading}
                >
                  {loading ? "Building…" : "Create property campaign"}
                </Button>
                <span className="text-muted-foreground self-center text-xs">
                  Add verified details, then build all channel drafts.
                </span>
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
              {listing && (
                <label className="ml-auto flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Status</span>
                  <select
                    className="bg-background rounded-md border px-2 py-1.5 text-xs"
                    value={
                      listing.marketingStatus ??
                      (listing.status === "pending"
                        ? "under-contract"
                        : listing.status === "sold"
                          ? "just-sold"
                          : listing.status === "off-market"
                            ? "off-market"
                            : "active")
                    }
                    onChange={(event) =>
                      updateListingStatus(
                        event.target.value as ListingMarketingStatus
                      )
                    }
                    disabled={!isAdmin || updatingStatus}
                    aria-label="Property status"
                  >
                    <option value="new">New</option>
                    <option value="active">Active</option>
                    <option value="under-contract">Under Contract</option>
                    <option value="just-sold">Just Sold</option>
                    <option value="off-market">Off Market</option>
                  </select>
                </label>
              )}
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
                {editingChannel === draft.channel ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={editingBody}
                      onChange={(event) => setEditingBody(event.target.value)}
                      rows={5}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveChannelDraft(draft.channel)}
                        disabled={savingDraft}
                      >
                        {savingDraft ? "Saving…" : "Save draft"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingChannel(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-2 text-sm whitespace-pre-wrap">
                      {draft.body}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 px-0 text-xs"
                      onClick={() => {
                        setEditingChannel(draft.channel);
                        setEditingBody(draft.body);
                      }}
                    >
                      Edit draft
                    </Button>
                  </>
                )}
                {draft.findings.length > 0 && (
                  <p className="mt-2 flex gap-1 text-xs text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Review:{" "}
                    {draft.findings.join(", ")}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  {approvedChannels.includes(draft.channel) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDecliningChannel(draft.channel);
                          setDeclineReason("");
                        }}
                        disabled={!isAdmin || approving}
                      >
                        Request revision
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approveDrafts([draft.channel])}
                        disabled={
                          !isAdmin ||
                          approving ||
                          draft.status !== "ready" ||
                          draft.findings.length > 0
                        }
                      >
                        {approving ? "Approving…" : "Approve channel"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDecliningChannel(draft.channel);
                          setDeclineReason("");
                        }}
                        disabled={!isAdmin || approving}
                      >
                        Request revision
                      </Button>
                    </div>
                  )}
                  {draft.status !== "ready" &&
                  !approvedChannels.includes(draft.channel) ? (
                    <span className="text-muted-foreground text-[11px]">
                      Not ready
                    </span>
                  ) : null}
                </div>
                {decliningChannel === draft.channel ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                    <label className="text-xs font-medium" htmlFor={`decline-${draft.channel}`}>
                      Revision request
                    </label>
                    <Textarea
                      id={`decline-${draft.channel}`}
                      className="mt-2 bg-background"
                      value={declineReason}
                      onChange={(event) => setDeclineReason(event.target.value)}
                      placeholder="What should change before approval?"
                      rows={3}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => declineDraft(draft.channel)}
                        disabled={!declineReason.trim()}
                      >
                        Record revision request
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDecliningChannel(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
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

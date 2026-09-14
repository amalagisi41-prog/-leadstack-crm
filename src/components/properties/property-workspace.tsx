"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImageIcon,
  Info,
  Megaphone,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CampaignBriefDoc } from "@/types/marketing-campaigns";
import type { IdxListingDoc } from "@/types/idx";

type ApprovalEvent = {
  id: string;
  channels: string[];
  approvedAt: string | null;
  approvedByUid: string;
  decision?: "approved" | "declined";
  reason?: string;
};

type WorkspaceListing = Omit<IdxListingDoc, "syncedAt"> & {
  syncedAt: string | null;
};
type WorkspaceBrief = Omit<CampaignBriefDoc, "createdAt" | "updatedAt"> & {
  createdAt: string | null;
  updatedAt: string | null;
};

type WorkspaceData = {
  brief: WorkspaceBrief;
  listing: WorkspaceListing | null;
  mediaPackage: {
    brochureUrl: string | null;
    photoCount: number;
    sourceName: string;
    updatedAt: string | null;
  } | null;
  approvals: ApprovalEvent[];
};

function dateLabel(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function displayValue(
  value: string | number | null | undefined,
  fallback = "Not provided"
) {
  return value === null || value === undefined || value === ""
    ? fallback
    : value;
}

function propertySource(listing: WorkspaceListing | null): {
  label: string;
  detail: string;
} {
  if (!listing) {
    return {
      label: "Marketing brief only",
      detail:
        "No synced or imported listing record is attached to this property. The details on this page are the saved marketing brief.",
    };
  }
  const importedFrom =
    typeof listing.raw?.importedFrom === "string"
      ? listing.raw.importedFrom
      : null;
  if (importedFrom) {
    const guidedEntry = importedFrom === "guided manual entry";
    return {
      label: guidedEntry ? "Guided-entry listing record" : "Imported listing record",
      detail: guidedEntry
        ? "Entered from verified source details by a workspace operator; it is not an MLS sync."
        : `Imported from ${importedFrom}.`,
    };
  }
  return {
    label: "Synced IDX listing record",
    detail: listing.syncedAt
      ? `Last synced ${dateLabel(listing.syncedAt)}.`
      : "Sync time is unavailable.",
  };
}

export function PropertyWorkspace({ listingId }: { listingId: string }) {
  const { subAccountId, saPath } = useSubAccount();
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subAccountId || !listingId) return;
    let current = true;
    setLoading(true);
    setError(null);
    void fetch(
      `/api/sub-accounts/${subAccountId}/marketing/campaigns/${listingId}/workspace`
    )
      .then(async (response) => {
        const data = (await response
          .json()
          .catch(() => ({}))) as WorkspaceData & { error?: string };
        if (!response.ok || !data.brief)
          throw new Error(
            data.error ?? "Could not load this property workspace."
          );
        return data;
      })
      .then((data) => {
        if (current) setWorkspace(data);
      })
      .catch((reason) => {
        if (current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load this property workspace."
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [listingId, subAccountId]);

  const source = useMemo(
    () => propertySource(workspace?.listing ?? null),
    [workspace?.listing]
  );

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <RefreshCw className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Info className="text-muted-foreground mx-auto h-7 w-7" />
          <h1 className="mt-3 text-lg font-semibold">
            Property workspace unavailable
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {error ?? "No property record was returned."}
          </p>
          <Button
            className="mt-4"
            variant="outline"
            render={<Link href={saPath("/properties")} />}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Return to Properties
          </Button>
        </div>
      </div>
    );
  }

  const { brief, listing, mediaPackage, approvals } = workspace;
  const channelDrafts = brief.brief.channels;
  const approved = new Set(brief.approvedChannels);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href={saPath("/properties")}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Properties
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            {brief.brief.address || "Untitled property"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {[brief.brief.city, brief.brief.state, brief.brief.zip]
              .filter(Boolean)
              .join(", ") || "Location not provided"}
          </p>
        </div>
        <Button
          render={
            <Link href={saPath(`/marketing/campaigns?listing=${listingId}`)} />
          }
        >
          <Megaphone className="mr-1.5 h-4 w-4" /> Open campaign editor
        </Button>
      </div>

      <Tabs defaultValue="details">
        <TabsList
          variant="line"
          className="mb-6 w-full justify-start overflow-x-auto"
        >
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="marketing">
            Marketing{" "}
            <span className="text-muted-foreground">
              {channelDrafts.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="activity">
            Activity{" "}
            <span className="text-muted-foreground">{approvals.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <DetailsTab brief={brief} listing={listing} source={source} />
        </TabsContent>
        <TabsContent value="assets">
          <AssetsTab
            brief={brief}
            mediaPackage={mediaPackage}
            subAccountId={subAccountId}
            listingId={listingId}
            campaignHref={saPath(`/marketing/campaigns?listing=${listingId}`)}
          />
        </TabsContent>
        <TabsContent value="marketing">
          <MarketingTab
            drafts={channelDrafts}
            approved={approved}
            campaignHref={saPath(`/marketing/campaigns?listing=${listingId}`)}
          />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityTab brief={brief} approvals={approvals} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailsTab({
  brief,
  listing,
  source,
}: {
  brief: WorkspaceData["brief"];
  listing: WorkspaceListing | null;
  source: { label: string; detail: string };
}) {
  const facts = [
    [
      "Price",
      brief.brief.price
        ? `$${brief.brief.price.toLocaleString()}`
        : "Price not provided",
    ],
    ["Bedrooms", displayValue(brief.brief.beds, "Not provided")],
    ["Bathrooms", displayValue(brief.brief.baths, "Not provided")],
    [
      "Square feet",
      brief.brief.sqft ? brief.brief.sqft.toLocaleString() : "Not provided",
    ],
    ["Property type", displayValue(brief.brief.propertyType)],
    [
      "MLS / listing ID",
      displayValue(listing?.mlsId || brief.brief.mlsId, "No MLS ID recorded"),
    ],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="bg-card rounded-2xl border p-5 lg:col-span-2">
        <h2 className="font-semibold">Property details</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="mt-1 text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 border-t pt-5">
          <h3 className="text-sm font-semibold">Listing remarks</h3>
          <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
            {brief.brief.description || "No listing remarks were saved."}
          </p>
        </div>
      </section>
      <section className="bg-card rounded-2xl border p-5">
        <h2 className="font-semibold">Data record</h2>
        <div className="bg-muted/50 mt-4 rounded-xl p-3">
          <p className="text-sm font-medium">{source.label}</p>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {source.detail}
          </p>
        </div>
        {brief.brief.dataGaps.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium">Missing details</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700">
              {brief.brief.dataGaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-xs">
            No missing fields were identified when this marketing brief was
            generated.
          </p>
        )}
      </section>
    </div>
  );
}

function AssetsTab({
  brief,
  mediaPackage,
  subAccountId,
  listingId,
  campaignHref,
}: {
  brief: WorkspaceData["brief"];
  mediaPackage: WorkspaceData["mediaPackage"];
  subAccountId: string;
  listingId: string;
  campaignHref: string;
}) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  async function createShareLink() {
    setSharing(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/campaigns/${listingId}/media-package/share`,
        { method: "POST" }
      );
      const data = (await response.json().catch(() => ({}))) as {
        shareUrl?: string;
        error?: string;
      };
      if (!response.ok || !data.shareUrl)
        throw new Error(data.error ?? "Could not create the media package link.");
      setShareUrl(data.shareUrl);
      await navigator.clipboard?.writeText(data.shareUrl);
      toast.success("Media package link created and copied.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create the media package link."
      );
    } finally {
      setSharing(false);
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    await navigator.clipboard?.writeText(shareUrl);
    toast.success("Media package link copied.");
  }

  return (
    <div className="space-y-4">
      <section className="bg-card rounded-2xl border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Property photos</h2>
            <p className="text-muted-foreground mt-1 text-xs">
              {brief.brief.images.length
                ? `${brief.brief.images.length} photo${brief.brief.images.length === 1 ? "" : "s"} attached to this marketing brief.`
                : "No photos are attached to this marketing brief."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={campaignHref} />}
          >
            Manage assets
          </Button>
        </div>
        {brief.brief.images.length ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {brief.brief.images.map((image, index) => (
              <img
                key={`${image}-${index}`}
                src={image}
                alt={`${brief.brief.address} photo ${index + 1}`}
                className="aspect-[4/3] w-full rounded-lg border object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground mt-4 rounded-xl border border-dashed p-5 text-sm">
            <ImageIcon className="mb-2 h-5 w-5" /> Add photos in the campaign
            editor to build visual marketing assets.
          </div>
        )}
      </section>
      <section className="bg-card rounded-2xl border p-5">
        <div className="flex items-start gap-3">
          <PackageOpen className="text-primary mt-0.5 h-5 w-5" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Brochure and source files</h2>
            {mediaPackage ? (
              <>
                <p className="text-muted-foreground mt-1 text-xs">
                  Imported from {mediaPackage.sourceName};{" "}
                  {mediaPackage.photoCount} uploaded photo
                  {mediaPackage.photoCount === 1 ? "" : "s"} in the current
                  asset package.
                </p>
                {mediaPackage.brochureUrl ? (
                  <a
                    className="text-primary mt-3 inline-flex items-center gap-1 text-sm underline"
                    href={mediaPackage.brochureUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open generated brochure{" "}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <p className="text-muted-foreground mt-3 text-sm">
                    No brochure has been generated for this import.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-muted-foreground mt-1 text-xs">
                  No uploaded asset package is recorded for this property.
                </p>
                <p className="text-muted-foreground mt-3 text-sm">
                  Upload the verified listing export and photos in the campaign
                  editor to create one.
                </p>
              </>
            )}
          </div>
        </div>
      </section>
      <section className="bg-card rounded-2xl border p-5">
        <div className="flex items-start gap-3">
          <PackageOpen className="text-primary mt-0.5 h-5 w-5" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Partner media package</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Create one view-only link for the brochure, photos, source files,
              property link, and approved marketing drafts.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={createShareLink} disabled={sharing} size="sm">
                {sharing ? "Creating link…" : "Create share link"}
              </Button>
              {shareUrl ? (
                <>
                  <Button variant="outline" size="sm" onClick={copyShareLink}>
                    <Copy className="mr-1.5 h-4 w-4" /> Copy link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href={`mailto:?subject=${encodeURIComponent(`Media package: ${brief.brief.address}`)}&body=${encodeURIComponent(`Here is the property media package: ${shareUrl}`)}`}
                      />
                    }
                  >
                    Open email with link
                  </Button>
                </>
              ) : null}
            </div>
            {shareUrl ? (
              <div className="bg-muted/50 mt-3 break-all rounded-lg p-3 text-xs">
                {shareUrl}
                <p className="text-muted-foreground mt-1">
                  Anyone with this link can view the package. Create a new link
                  if you need to distribute a different version.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function MarketingTab({
  drafts,
  approved,
  campaignHref,
}: {
  drafts: WorkspaceData["brief"]["brief"]["channels"];
  approved: Set<string>;
  campaignHref: string;
}) {
  return (
    <section className="bg-card rounded-2xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Marketing drafts</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Review each channel in the campaign editor before it is approved or
            distributed.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={campaignHref} />}
        >
          Review drafts
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {drafts.map((draft) => (
          <article key={draft.channel} className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium capitalize">
                {draft.channel === "googleBusiness"
                  ? "Google Business"
                  : draft.channel}
              </h3>
              <span
                className={
                  approved.has(draft.channel)
                    ? "inline-flex items-center gap-1 text-xs text-emerald-700"
                    : "text-muted-foreground text-xs"
                }
              >
                {approved.has(draft.channel) ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                  </>
                ) : (
                  draft.status
                )}
              </span>
            </div>
            <p className="text-muted-foreground mt-3 line-clamp-4 text-sm whitespace-pre-wrap">
              {draft.body || "No draft copy was generated."}
            </p>
            {draft.findings.length ? (
              <p className="mt-3 text-xs text-amber-700">
                Needs review: {draft.findings.join(", ")}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function ActivityTab({
  brief,
  approvals,
}: {
  brief: WorkspaceData["brief"];
  approvals: ApprovalEvent[];
}) {
  const events = [
    {
      id: "created",
      title: "Property workspace created",
      detail: "Marketing brief created",
      at: brief.createdAt,
    },
    {
      id: "updated",
      title: "Marketing brief updated",
      detail: "Details, drafts, or workflow may have changed",
      at: brief.updatedAt,
    },
    ...approvals.map((approval) => ({
      id: approval.id,
      title:
        approval.decision === "declined"
          ? "Channel revision requested"
          : "Channel drafts approved",
      detail: [
        approval.channels.length
          ? approval.channels.join(", ")
          : "No channels recorded",
        approval.reason ? "Reason: " + approval.reason : null,
      ]
        .filter(Boolean)
        .join(" · "),
      at: approval.approvedAt,
    })),
  ].filter(
    (event, index, all) =>
      !(
        event.id === "updated" &&
        event.at === brief.createdAt &&
        all.some((item) => item.id === "created")
      )
  );
  return (
    <section className="bg-card rounded-2xl border p-5">
      <h2 className="font-semibold">Property activity</h2>
      <p className="text-muted-foreground mt-1 text-xs">
        Only recorded property events appear here. Events without a saved date
        are labelled accordingly.
      </p>
      <ol className="mt-5 space-y-4 border-l pl-5">
        {events.map((event) => (
          <li key={event.id} className="relative">
            <span className="border-background bg-primary absolute top-1 -left-[1.72rem] h-3 w-3 rounded-full border-2" />
            <p className="text-sm font-medium">{event.title}</p>
            <p className="text-muted-foreground text-xs">{event.detail}</p>
            <p className="text-muted-foreground mt-1 text-xs">
              {dateLabel(event.at)}
            </p>
          </li>
        ))}
      </ol>
      {approvals.length === 0 ? (
        <div className="bg-muted/50 text-muted-foreground mt-6 rounded-xl p-3 text-sm">
          <ShieldCheck className="mb-2 h-4 w-4" /> No channel approvals have
          been recorded for this property yet.
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building,
  ChevronRight,
  FileText,
  ImageIcon,
  MapPin,
  Plus,
  Search,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CampaignBriefDoc,
  CampaignWorkflowStep,
  ContentBrief,
} from "@/types/marketing-campaigns";

/* ── Property status labels ── */
type PropertyStatus =
  | "draft"
  | "coming-soon"
  | "active"
  | "under-contract"
  | "just-sold"
  | "archived";

const STATUS_META: Record<
  PropertyStatus,
  { label: string; color: string; bg: string }
> = {
  draft: { label: "Draft", color: "text-neutral-600", bg: "bg-neutral-100" },
  "coming-soon": {
    label: "Coming Soon",
    color: "text-amber-700",
    bg: "bg-amber-50",
  },
  active: { label: "Active", color: "text-green-700", bg: "bg-green-50" },
  "under-contract": {
    label: "Under Contract",
    color: "text-blue-700",
    bg: "bg-blue-50",
  },
  "just-sold": {
    label: "Just Sold",
    color: "text-purple-700",
    bg: "bg-purple-50",
  },
  archived: {
    label: "Archived",
    color: "text-neutral-500",
    bg: "bg-neutral-50",
  },
};

function workflowToStatus(step?: CampaignWorkflowStep): PropertyStatus {
  if (!step || step === "create") return "draft";
  if (step === "optimize") return "active";
  if (step === "schedule") return "active";
  if (step === "archive") return "archived";
  return "draft";
}

interface PropertyCardData {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number | null;
  propertyType: string;
  status: PropertyStatus;
  workflowStep: CampaignWorkflowStep;
  imageUrl: string | null;
  channelCount: number;
  approvedCount: number;
  hasAssets: boolean;
  nextAction: string;
}

function deriveNextAction(
  step: CampaignWorkflowStep,
  approvedCount: number,
  channelCount: number
): string {
  if (step === "create") return "Complete property details";
  if (step === "optimize" && approvedCount === 0) return "Review & approve assets";
  if (step === "optimize" && approvedCount < channelCount)
    return `${channelCount - approvedCount} assets awaiting approval`;
  if (step === "schedule") return "Schedule distribution";
  if (step === "archive") return "Archived";
  return "Review assets";
}

function briefToCard(
  doc: CampaignBriefDoc & { listing?: Record<string, unknown> | null }
): PropertyCardData {
  const b = doc.brief;
  const step = doc.workflowStep ?? "create";
  const channelCount = b.channels?.length ?? 0;
  const approvedCount = doc.approvedChannels?.length ?? 0;

  return {
    id: doc.id,
    address: b.address || "Untitled Property",
    city: b.city || "",
    state: b.state || "",
    zip: b.zip || "",
    price: b.price || 0,
    beds: b.beds || 0,
    baths: b.baths || 0,
    sqft: b.sqft,
    propertyType: b.propertyType || "Residential",
    status: workflowToStatus(step),
    workflowStep: step,
    imageUrl: b.images?.[0] ?? null,
    channelCount,
    approvedCount,
    hasAssets: channelCount > 0,
    nextAction: deriveNextAction(step, approvedCount, channelCount),
  };
}

/* ── Status filter tabs ── */
const STATUS_FILTERS: { key: PropertyStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "active", label: "Active" },
  { key: "under-contract", label: "Under Contract" },
  { key: "just-sold", label: "Just Sold" },
  { key: "archived", label: "Archived" },
];

export default function PropertiesPage() {
  const { subAccountId, saPath } = useSubAccount();
  const [briefs, setBriefs] = useState<PropertyCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PropertyStatus | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!subAccountId) return;
    let active = true;
    setLoading(true);
    void fetch(`/api/sub-accounts/${subAccountId}/marketing/campaigns`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as {
          briefs: (CampaignBriefDoc & {
            listing?: Record<string, unknown> | null;
          })[];
        };
        if (active) {
          setBriefs(data.briefs.map(briefToCard));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [subAccountId]);

  const filtered = useMemo(() => {
    let list = briefs;
    if (filter !== "all") list = list.filter((p) => p.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.address.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q)
      );
    }
    return list;
  }, [briefs, filter, search]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Properties
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Your listings and their marketing status at a glance.
          </p>
        </div>
        <Link href={saPath("/marketing/campaigns")}>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add Property
          </Button>
        </Link>
      </div>

      {/* Search + filter bar */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by address or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-4 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_FILTERS.map((sf) => (
            <button
              key={sf.key}
              onClick={() => setFilter(sf.key)}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                filter === sf.key
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              )}
            >
              {sf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Property cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 py-16 text-center">
          <MapPin className="mx-auto mb-3 h-8 w-8 text-neutral-400" />
          <h3 className="text-sm font-semibold text-neutral-900">
            {briefs.length === 0
              ? "No properties yet"
              : "No properties match your filter"}
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            {briefs.length === 0
              ? "Add your first property to start generating marketing assets."
              : "Try a different filter or search term."}
          </p>
          {briefs.length === 0 && (
            <Link href={saPath("/marketing/campaigns")} className="mt-4 inline-block">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Property
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((property) => (
            <PropertyCard
              key={property.id}
              property={property}
              saPath={saPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyCard({
  property,
  saPath,
}: {
  property: PropertyCardData;
  saPath: (path: string) => string;
}) {
  const statusMeta = STATUS_META[property.status];
  const formattedPrice = property.price
    ? `$${property.price.toLocaleString()}`
    : "Price TBD";

  return (
    <Link
      href={saPath(`/marketing/campaigns?listing=${property.id}`)}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-shadow hover:shadow-md"
    >
      {/* Image */}
      <div className="relative aspect-[16/10] bg-neutral-100">
        {property.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.imageUrl}
            alt={property.address}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Building className="h-10 w-10 text-neutral-300" />
          </div>
        )}
        <span
          className={cn(
            "absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold",
            statusMeta.bg,
            statusMeta.color
          )}
        >
          {statusMeta.label}
        </span>
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col p-4">
        <p className="text-lg font-semibold text-neutral-900 leading-snug">
          {formattedPrice}
        </p>
        <p className="mt-0.5 text-sm text-neutral-600 leading-snug">
          {property.address}
        </p>
        <p className="text-xs text-neutral-400">
          {[property.city, property.state, property.zip]
            .filter(Boolean)
            .join(", ")}
        </p>

        {/* Stats row */}
        <div className="mt-3 flex gap-3 text-xs text-neutral-500">
          {property.beds > 0 && <span>{property.beds} bd</span>}
          {property.baths > 0 && <span>{property.baths} ba</span>}
          {property.sqft && (
            <span>{property.sqft.toLocaleString()} sqft</span>
          )}
          <span className="capitalize">{property.propertyType}</span>
        </div>

        {/* Asset summary + next action */}
        <div className="mt-auto pt-3">
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            {property.hasAssets && (
              <>
                <FileText className="h-3 w-3" />
                <span>
                  {property.approvedCount}/{property.channelCount} approved
                </span>
                <span className="text-neutral-300">·</span>
              </>
            )}
            {property.imageUrl && (
              <>
                <ImageIcon className="h-3 w-3" />
                <span>Photos</span>
              </>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-blue-600">
              {property.nextAction}
            </span>
            <ChevronRight className="h-4 w-4 text-neutral-300 transition-colors group-hover:text-neutral-500" />
          </div>
        </div>
      </div>
    </Link>
  );
}

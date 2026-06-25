import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getCommunityGate } from "@/lib/community/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import { getGroupBySlug, getMembership } from "@/lib/server/community-service";
import { JoinButton } from "./join-button";

export const dynamic = "force-dynamic";

const DEFAULT_BRAND = "#202124";

function formatPrice(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

/**
 * Public group "About" / landing page — the Skool-style sales page that sells
 * the group and handles join. Server-rendered via the Admin SDK (rules bypass).
 * Gated: a disabled sub-account or an unpublished group both 404.
 */
export default async function GroupAboutPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string }>;
}) {
  const { saId, groupSlug } = await params;

  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) notFound();

  const group = await getGroupBySlug(saId, groupSlug);
  if (!group || group.status !== "published") notFound();

  const member = await getCurrentMember(saId);
  let state: "guest" | "member" | "joined" | "pending" = member
    ? "member"
    : "guest";
  if (member) {
    const membership = await getMembership(saId, group.id, member.id);
    if (membership?.status === "active") state = "joined";
    else if (membership?.status === "pending") state = "pending";
  }

  const brand = group.brandColor?.trim() || DEFAULT_BRAND;
  const priceLabel =
    group.access === "paid"
      ? formatPrice(group.priceCents, group.currency)
      : "Free";

  return (
    <div className="min-h-screen bg-[#F8F7F5]">
      <header className="border-b border-[#E4E4E4] bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            {group.logoUrl || group.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.logoUrl ?? group.coverUrl ?? ""}
                alt=""
                className="h-7 w-7 rounded object-cover"
              />
            ) : (
              <div
                className="flex h-7 w-7 items-center justify-center rounded text-xs font-semibold text-white"
                style={{ backgroundColor: brand }}
              >
                {group.name.charAt(0)}
              </div>
            )}
            <span className="text-sm font-semibold text-[#202124]">
              {group.name}
            </span>
          </div>
          {member ? (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: brand }}
              title={member.email}
            >
              {(member.displayName?.charAt(0) || member.email.charAt(0)).toUpperCase()}
            </div>
          ) : (
            <a
              href={`/c/${saId}/login`}
              className="rounded-md border border-[#E4E4E4] px-4 py-1.5 text-sm font-medium text-[#202124] hover:bg-[#F8F7F5]"
            >
              Log in
            </a>
          )}
        </div>
      </header>
      <div className="px-4 py-10">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[1fr_340px]">
        {/* Left — the sales column */}
        <div className="space-y-5">
          {group.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={group.coverUrl}
              alt={group.name}
              className="aspect-video w-full rounded-xl border border-[#E4E4E4] object-cover"
            />
          ) : (
            <div
              className="flex aspect-video w-full items-center justify-center rounded-xl text-2xl font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              {group.name}
            </div>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-[#202124]">
            {group.name}
          </h1>
          <div className="flex items-center gap-3 text-sm text-[#909090]">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {group.memberCount}{" "}
              {group.memberCount === 1 ? "member" : "members"}
            </span>
            <span>·</span>
            <span>{priceLabel}</span>
          </div>
          {group.about && (
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-[#3a3a44]">
              {group.about}
            </div>
          )}
        </div>

        {/* Right — the info / join card */}
        <aside className="h-fit rounded-xl border border-[#E4E4E4] bg-white p-5 shadow-sm md:sticky md:top-10">
          {group.cardImageUrl || group.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={group.cardImageUrl ?? group.coverUrl ?? ""}
              alt=""
              className="mb-3 aspect-video w-full rounded-lg object-cover"
            />
          ) : (
            <div
              className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg text-lg font-semibold text-white"
              style={{ backgroundColor: brand }}
            >
              {group.name.charAt(0)}
            </div>
          )}
          <h2 className="text-lg font-semibold text-[#202124]">{group.name}</h2>
          <p className="mt-0.5 text-xs text-[#909090]">
            /c/{saId}/{group.slug}
          </p>
          {(group.tagline?.trim() || group.about) && (
            <p className="mt-2 line-clamp-3 text-sm text-[#3a3a44]">
              {group.tagline?.trim() || group.about}
            </p>
          )}

          <div className="my-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-[#F8F7F5] py-2">
              <div className="text-base font-semibold text-[#202124]">
                {group.memberCount}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-[#909090]">
                Members
              </div>
            </div>
            <div className="rounded-lg bg-[#F8F7F5] py-2">
              <div className="text-base font-semibold text-[#202124]">
                {priceLabel}
              </div>
              <div className="text-[11px] uppercase tracking-wide text-[#909090]">
                {group.access === "paid" ? "One-time" : "Access"}
              </div>
            </div>
          </div>

          <JoinButton
            saId={saId}
            groupSlug={group.slug}
            groupId={group.id}
            state={state}
            access={group.access}
            priceLabel={priceLabel}
            brandColor={brand}
          />
        </aside>
        </div>
      </div>
    </div>
  );
}

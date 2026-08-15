import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { AgentSiteRenderer } from "@/components/website-studio/agent-site-renderer";
import { getTemplate } from "@/lib/website-studio/templates";
import type { AgentSiteDoc } from "@/types/agent-site";

/**
 * Published agent website — /agent/[subAccountId]/[slug].
 *
 * Server-rendered from `subAccounts/{id}/agentSites/main`. Only renders when
 * the site is published and the slug matches; otherwise 404 (don't leak
 * drafts). Public path (see middleware).
 */

export const dynamic = "force-dynamic";

export default async function PublishedAgentSite({
  params,
}: {
  params: Promise<{ subAccountId: string; slug: string }>;
}) {
  const { subAccountId, slug } = await params;

  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/agentSites/main`)
    .get();

  if (!snap.exists) notFound();
  const site = snap.data() as AgentSiteDoc;
  if (site.status !== "published" || site.slug !== slug) notFound();

  return (
    <AgentSiteRenderer
      template={getTemplate(site.templateId)}
      content={site.content}
      design={site.design ?? {}}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subAccountId: string; slug: string }>;
}) {
  const { subAccountId, slug } = await params;
  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/agentSites/main`)
    .get();
  if (!snap.exists) return { title: "Agent Website" };
  const site = snap.data() as AgentSiteDoc;
  if (site.status !== "published" || site.slug !== slug) return { title: "Not found" };
  const name = site.content.agentName || "Agent";
  const title =
    site.content.metaTitle.trim() ||
    `${name}${site.content.title ? ` — ${site.content.title}` : ""}`;
  const description =
    site.content.metaDescription.trim() ||
    site.content.tagline ||
    site.content.bio ||
    undefined;
  const ogImage = site.content.ogImageUrl.trim() || site.content.heroImageUrl || undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

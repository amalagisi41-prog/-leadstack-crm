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

  const db = getAdminDb();
  const [snap, subAccountSnap] = await Promise.all([
    db.doc(`subAccounts/${subAccountId}/agentSites/main`).get(),
    db.doc(`subAccounts/${subAccountId}`).get(),
  ]);

  if (!snap.exists) notFound();
  const site = snap.data() as AgentSiteDoc;
  if (site.status !== "published" || site.slug !== slug) notFound();
  const subAccount = subAccountSnap.data();
  const idxConnected = Boolean(
    subAccount?.idxEnabledByAgency === true && subAccount?.idxConfig?.enabled
  );

  return (
    <AgentSiteRenderer
      template={getTemplate(site.templateId)}
      content={site.content}
      composition={site.composition}
      idx={{
        connected: idxConnected,
        url: `/idx/${subAccountId}`,
        displayName: subAccount?.idxConfig?.displayName,
      }}
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
  if (site.status !== "published" || site.slug !== slug)
    return { title: "Not found" };
  const name = site.content.agentName || "Agent";
  return {
    title: `${name}${site.content.title ? ` — ${site.content.title}` : ""}`,
    description: site.content.tagline || site.content.bio || undefined,
  };
}

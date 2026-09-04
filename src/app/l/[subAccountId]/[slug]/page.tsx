import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { FunnelRenderer } from "@/components/funnels/funnel-renderer";
import type { FunnelDoc } from "@/types/funnel";

/**
 * Public funnel landing page — /l/[subAccountId]/[slug].
 *
 * Server-rendered from `subAccounts/{id}/funnels/*` (matched by slug). Only
 * renders when the funnel is published; otherwise 404 (drafts never leak).
 * Public path (see middleware). The lead-capture form POSTs to
 * /api/l/[subAccountId]/[slug]/submit.
 */

export const dynamic = "force-dynamic";

async function loadFunnel(
  subAccountId: string,
  slug: string,
): Promise<{ funnel: FunnelDoc; businessName: string; logoUrl: string | null; accentColor: string | null } | null> {
  const db = getAdminDb();
  const snap = await db
    .collection(`subAccounts/${subAccountId}/funnels`)
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const funnel = snap.docs[0].data() as FunnelDoc;
  if (funnel.status !== "published") return null;

  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const subData = subSnap.data() ?? {};
  const businessName = (subData.name as string) ?? "";
  return { funnel, businessName, logoUrl: (subData.logoUrl as string | null) ?? null, accentColor: (subData.accentColor as string | null) ?? null };
}

export default async function PublicFunnelPage({
  params,
}: {
  params: Promise<{ subAccountId: string; slug: string }>;
}) {
  const { subAccountId, slug } = await params;
  const loaded = await loadFunnel(subAccountId, slug);
  if (!loaded) notFound();

  return (
    <FunnelRenderer
      content={loaded.funnel.content}
      businessName={loaded.businessName || undefined}
      logoUrl={loaded.logoUrl}
      accentColor={loaded.accentColor}
      submit={{ subAccountId, slug }}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subAccountId: string; slug: string }>;
}) {
  const { subAccountId, slug } = await params;
  const loaded = await loadFunnel(subAccountId, slug);
  if (!loaded) return { title: "Not found" };
  const workspace = loaded.businessName || "Workspace";
  return {
    title: `${loaded.funnel.content.headline || loaded.funnel.name} · ${workspace}`,
    description: loaded.funnel.content.subhead || undefined,
  };
}

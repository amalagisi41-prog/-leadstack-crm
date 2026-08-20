import { redirect } from "next/navigation";

/**
 * Legacy alias kept for bookmarked links and older Zack responses.
 * Lead Capture was renamed to Forms; never strand an operator on a 404.
 */
export default async function LegacyLeadCapturePage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;
  redirect(`/sa/${encodeURIComponent(subAccountId)}/forms`);
}

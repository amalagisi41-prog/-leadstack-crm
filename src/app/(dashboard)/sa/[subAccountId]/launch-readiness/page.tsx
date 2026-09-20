import { redirect } from "next/navigation";

interface LaunchReadinessRedirectProps {
  params: Promise<{ subAccountId: string }>;
}

/**
 * Legacy route kept for old bookmarks and onboarding links.
 *
 * Launch Readiness is no longer a customer-facing setup gate. Site Health is
 * the operational place for diagnostics; the first-run experience asks a few
 * questions and routes the user directly to the connection or workflow that
 * fits their answers.
 */
export default async function LaunchReadinessRedirect({
  params,
}: LaunchReadinessRedirectProps) {
  const { subAccountId } = await params;
  redirect(`/sa/${subAccountId}/site-health`);
}

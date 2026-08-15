import { redirect } from "next/navigation";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";

/**
 * Legacy redirect. `/automations` never existed as a route, but onboarding,
 * the agency getting-started tabs, and settings all linked to it — so those
 * CTAs 404'd. Those links now point at `/workflows` directly; this route
 * stays for bookmarks and any link already sent out in email.
 */
export default async function LegacyAutomationsPage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;
  redirect(`/sa/${subAccountId}${SUB_ACCOUNT_ROUTES.workflows}`);
}

import { redirect } from "next/navigation";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";

/** Legacy redirect — see ../page.tsx. */
export default async function LegacyAutomationsSettingsPage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;
  redirect(`/sa/${subAccountId}${SUB_ACCOUNT_ROUTES.workflows}`);
}

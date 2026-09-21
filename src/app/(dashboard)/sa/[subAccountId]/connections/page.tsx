import { redirect } from "next/navigation";

export default async function ConnectionsLegacyPage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;
  redirect(`/sa/${subAccountId}/connect`);
}

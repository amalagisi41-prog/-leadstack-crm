import { redirect } from "next/navigation";

interface ConnectionsAliasProps {
  params: Promise<{ subAccountId: string }>;
}

/**
 * Legacy bookmark alias. The customer-facing destination is /connect.
 * Keeping this route prevents older links from becoming a 404.
 */
export default async function ConnectionsAlias({ params }: ConnectionsAliasProps) {
  const { subAccountId } = await params;
  redirect(`/sa/${subAccountId}/connect`);
}

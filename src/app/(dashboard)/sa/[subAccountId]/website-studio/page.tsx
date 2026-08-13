import { WebsiteStudioApp } from "@/components/website-studio/website-studio-app";
import { WebsiteTransferApp } from "@/components/website-studio/website-transfer-app";

export default async function WebsiteStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const query = await searchParams;
  return query.mode === "replacement" ? (
    <WebsiteTransferApp />
  ) : (
    <WebsiteStudioApp />
  );
}

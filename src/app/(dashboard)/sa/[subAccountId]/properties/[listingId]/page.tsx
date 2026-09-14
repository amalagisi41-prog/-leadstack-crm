import { PropertyWorkspace } from "@/components/properties/property-workspace";

export default async function PropertyWorkspacePage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  return <PropertyWorkspace listingId={listingId} />;
}

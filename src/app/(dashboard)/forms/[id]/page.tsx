import { LegacyRedirect } from "@/components/legacy-redirect";

export default async function LegacyFormBuilder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LegacyRedirect toSubPath={`/forms/${id}`} />;
}

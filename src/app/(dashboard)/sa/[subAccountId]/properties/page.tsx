import { redirect } from "next/navigation";

interface PropertiesPageProps {
  params: Promise<{ subAccountId: string }>;
}

/**
 * Canonical inventory lives at /idx. Keep /properties as a bookmark-safe
 * alias so there is only one place to manage the workspace's properties.
 */
export default async function PropertiesPage({ params }: PropertiesPageProps) {
  const { subAccountId } = await params;
  redirect(`/sa/${subAccountId}/idx`);
}

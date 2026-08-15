import { redirect } from "next/navigation";

export default async function ImportedExactStudioPage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;
  redirect(`/sa/${subAccountId}/website-studio/vibe`);
}

import { redirect } from "next/navigation";

/** Legacy form-editor alias. */
export default async function LegacyLeadCaptureEditorPage({
  params,
}: {
  params: Promise<{ subAccountId: string; id: string }>;
}) {
  const { subAccountId, id } = await params;
  redirect(
    `/sa/${encodeURIComponent(subAccountId)}/forms/${encodeURIComponent(id)}`,
  );
}

import { redirect } from "next/navigation";

/**
 * Legacy booking-editor alias kept for old Zack actions and bookmarks.
 * The canonical editor is /booking/new.
 */
export default async function LegacyBookingCreatePage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;
  redirect(`/sa/${encodeURIComponent(subAccountId)}/booking/new`);
}

import { notFound, redirect } from "next/navigation";
import { getCommunityGate } from "@/lib/community/gate";
import { getCurrentMember } from "@/lib/community/member-session";
import { getMembership } from "@/lib/server/community-service";
import { getAdminDb } from "@/lib/firebase/admin";
import { Button } from "@/components/ui/button";
import type { CommunityGroup } from "@/types/community";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ saId: string }>;
}

/**
 * Community root for a signed-in member. Sends them into the first published
 * group; falls back to a "nothing here yet" card when none are live.
 */
export default async function CommunityHomePage({ params }: PageProps) {
  const { saId } = await params;

  const gate = await getCommunityGate(saId);
  if (!gate || !gate.enabled) notFound();

  const member = await getCurrentMember(saId);
  if (!member) redirect(`/c/${saId}/login`);

  const snap = await getAdminDb()
    .collection(`subAccounts/${saId}/communityGroups`)
    .where("status", "==", "published")
    .get();
  const groups = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<CommunityGroup, "id">) }),
  );

  if (groups.length > 0) {
    // Prefer a group the member already belongs to — drop them in its feed.
    for (const g of groups) {
      const membership = await getMembership(saId, g.id, member.id);
      if (membership?.status === "active") {
        redirect(`/c/${saId}/${g.slug}/community`);
      }
    }
    // Otherwise send them to the first group's About to join.
    redirect(`/c/${saId}/${groups[0].slug}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F7F5] px-4 py-16">
      <div className="w-full max-w-md rounded-xl border border-[#E4E4E4] bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-[#202124]">
          You&apos;re signed in
        </h1>
        <p className="mt-2 text-sm text-[#909090]">
          Signed in as{" "}
          <span className="font-medium text-[#202124]">{member.email}</span>.
          There aren&apos;t any communities live here yet.
        </p>
        <form
          action={`/api/community/${saId}/logout`}
          method="post"
          className="mt-6"
        >
          <Button
            type="submit"
            variant="outline"
            className="w-full border-[#E4E4E4] bg-white text-[#202124] hover:bg-[#F8F7F5]"
          >
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireMemberApi } from "@/lib/community/member-context";
import { listInboxServerSide } from "@/lib/server/community-dm-service";
import {
  COMMUNITY_BG,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { DmInbox } from "@/components/community/dm/dm-inbox";

export const dynamic = "force-dynamic";

export default async function MessagesInboxPage({
  params,
}: {
  params: Promise<{ saId: string }>;
}) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    if (access.status === 401) redirect(`/c/${saId}/login`);
    notFound();
  }

  const items = await listInboxServerSide({
    subAccountId: saId,
    viewerId: access.member.id,
  });
  const brand = COMMUNITY_DEFAULT_BRAND;

  return (
    <div className="min-h-screen" style={{ backgroundColor: COMMUNITY_BG }}>
      <header className="border-b border-[#E4E4E4] bg-white">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link
            href={`/c/${saId}`}
            className="flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
          >
            <ArrowLeft className="h-4 w-4" /> Community
          </Link>
          <span className="text-sm font-semibold text-[#202124]">Messages</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">
        <DmInbox saId={saId} brand={brand} initialItems={items} />
      </main>
    </div>
  );
}

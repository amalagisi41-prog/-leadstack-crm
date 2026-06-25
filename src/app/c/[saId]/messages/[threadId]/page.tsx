import { notFound, redirect } from "next/navigation";
import { requireMemberApi } from "@/lib/community/member-context";
import {
  getThreadOther,
  hasBlocked,
  listMessagesServerSide,
  memberViewById,
} from "@/lib/server/community-dm-service";
import { COMMUNITY_DEFAULT_BRAND } from "@/components/community/community-shell";
import { DmThread } from "@/components/community/dm/dm-thread";

export const dynamic = "force-dynamic";

export default async function DmThreadPage({
  params,
}: {
  params: Promise<{ saId: string; threadId: string }>;
}) {
  const { saId, threadId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind === "error") {
    if (access.status === 401) redirect(`/c/${saId}/login`);
    notFound();
  }
  const viewerId = access.member.id;

  // Resolve the other participant. A thread id is `a__b`; if the thread
  // doesn't exist yet (a brand-new chat), derive the other id from the route.
  let other = await getThreadOther({ subAccountId: saId, threadId, viewerId });
  if (!other) {
    const ids = threadId.split("__");
    if (ids.length !== 2 || !ids.includes(viewerId)) notFound();
    const otherId = ids.find((x) => x !== viewerId)!;
    other = await memberViewById(saId, otherId);
  }

  const [messages, blockedByMe] = await Promise.all([
    listMessagesServerSide({ subAccountId: saId, threadId, viewerId }),
    hasBlocked(saId, viewerId, other.memberId),
  ]);

  return (
    <DmThread
      saId={saId}
      threadId={threadId}
      viewerId={viewerId}
      other={other}
      brand={COMMUNITY_DEFAULT_BRAND}
      initialMessages={messages ?? []}
      blockedByMe={blockedByMe}
    />
  );
}

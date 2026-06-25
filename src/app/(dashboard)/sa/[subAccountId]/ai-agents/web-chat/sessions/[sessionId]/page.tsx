import { WebChatSessionThread } from "@/components/ai-agents/web-chat-session-thread";

/**
 * Web Chat operator console — single session detail. Live transcript +
 * captured identity + linked Contact (when one exists).
 */
export default async function WebChatSessionDetailPage({
  params,
}: {
  params: Promise<{ subAccountId: string; sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <div className="mx-auto max-w-3xl">
      <WebChatSessionThread sessionId={sessionId} />
    </div>
  );
}

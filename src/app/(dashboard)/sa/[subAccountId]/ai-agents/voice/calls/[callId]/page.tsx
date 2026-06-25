import { VoiceCallThread } from "@/components/ai-agents/voice-call-thread";

/**
 * Voice call detail — summary, transcript, follow-up task controls.
 * Symmetric to the Web Chat session detail page.
 */
export default async function VoiceCallDetailPage({
  params,
}: {
  params: Promise<{ subAccountId: string; callId: string }>;
}) {
  const { callId } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <VoiceCallThread callId={callId} />
    </div>
  );
}

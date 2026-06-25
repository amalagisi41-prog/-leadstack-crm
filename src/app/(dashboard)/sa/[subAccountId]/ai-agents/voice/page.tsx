import { VoiceChannelSection } from "@/components/ai-agents/voice-channel-section";

/**
 * Voice channel page — operational settings only (enabled, greeting,
 * voice render, max duration, model, escalation overrides). The shared
 * persona lives on the Overview page.
 */
export default function AiAgentsVoicePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <VoiceChannelSection />
    </div>
  );
}

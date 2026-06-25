import { SmsChannelSection } from "@/components/ai-agents/sms-channel-section";

/**
 * SMS channel page — operational settings only (enabled, model, context,
 * escalation overrides). The shared persona lives on the Overview page.
 */
export default function AiAgentsSmsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <SmsChannelSection />
    </div>
  );
}

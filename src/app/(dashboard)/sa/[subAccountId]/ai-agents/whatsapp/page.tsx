import { WhatsappChannelSection } from "@/components/ai-agents/whatsapp-channel-section";

/**
 * WhatsApp channel page — operational settings only (enabled, model, context,
 * escalation overrides). The shared persona lives on the Overview page; the
 * WhatsApp sender number is configured under Settings → SMS.
 */
export default function AiAgentsWhatsappPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <WhatsappChannelSection />
    </div>
  );
}

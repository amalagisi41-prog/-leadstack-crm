import { WhatsappTemplatesManager } from "@/components/ai-agents/whatsapp-templates-manager";

/**
 * WhatsApp templates page — create, submit, and track the approval status of
 * Meta message templates (v2). Lives under the WhatsApp channel.
 */
export default function AiAgentsWhatsappTemplatesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <WhatsappTemplatesManager />
    </div>
  );
}

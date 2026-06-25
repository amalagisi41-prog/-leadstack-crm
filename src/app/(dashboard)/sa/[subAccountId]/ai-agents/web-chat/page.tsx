import { WebChatChannelSection } from "@/components/ai-agents/web-chat-channel-section";

/**
 * Web Chat channel page — operational settings (enabled, welcome
 * message, theme, allowed domains, overrides) plus the embed snippet.
 * The shared persona + KB live on the Overview page.
 */
export default function AiAgentsWebChatPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <WebChatChannelSection />
    </div>
  );
}

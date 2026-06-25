import { ChannelNav } from "@/components/ai-agents/channel-nav";

/**
 * Shared shell for the AI Agents area. Renders the channel tabs once at
 * the layout level so navigation between channels is instant — only the
 * page body re-renders on route change.
 */
export default function AiAgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 z-20 -mx-4 -mt-4 bg-background/95 backdrop-blur md:-mx-6 md:-mt-6">
        <ChannelNav />
      </div>
      <div className="flex-1 pt-10">{children}</div>
    </div>
  );
}

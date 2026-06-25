import { Sparkles } from "lucide-react";
import { getChannel, type AiChannelId } from "@/components/ai-agents/channels";

/**
 * Placeholder shown on channel pages that aren't built yet. Reads its
 * copy from the central channels list — drop a channel's `comingSoon`
 * flag and this stops rendering for it automatically.
 */
export function ComingSoon({ channelId }: { channelId: AiChannelId }) {
  const channel = getChannel(channelId);
  const Icon = channel.icon;

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-10 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <h2 className="text-xl font-semibold tracking-tight">
          {channel.label} agent — coming soon
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{channel.blurb}</p>

        <div className="mt-6 inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="h-3 w-3 text-violet-500" />
          On the roadmap
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Want to be first to test it? Open the chat widget at the bottom of
          the page and let us know.
        </p>
      </div>
    </div>
  );
}

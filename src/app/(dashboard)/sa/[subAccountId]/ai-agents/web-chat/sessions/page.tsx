import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { WebChatSessionsList } from "@/components/ai-agents/web-chat-sessions-list";

/**
 * Web Chat operator console — list view. Sits under the Web Chat
 * channel page so the channel tabs from the AI Agents layout stay
 * visible. The "Back to Web Chat settings" link makes the hierarchy
 * obvious.
 */
export default async function WebChatSessionsPage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const { subAccountId } = await params;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href={`/sa/${subAccountId}/ai-agents/web-chat`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Web Chat settings
      </Link>

      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Web Chat sessions
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Live inbox of every chat session on this sub-account. Updates
            as visitors send messages.
          </p>
        </div>
      </header>

      <WebChatSessionsList />
    </div>
  );
}

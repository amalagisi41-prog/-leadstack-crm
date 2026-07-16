"use client";

import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openSupportChat } from "@/lib/support-chat";

/**
 * Opens the product chat on public marketing pages and falls back to
 * Crisp elsewhere. Safe no-op when neither is configured.
 */
export function ChatCta() {
  return (
    <Button onClick={openSupportChat} size="lg">
      <MessageCircle className="h-4 w-4" />
      Chat with us
    </Button>
  );
}

/** Inline text link that opens the support chat. Same safe no-op behaviour. */
export function ChatLink({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={openSupportChat}
      className="font-medium text-violet-500 underline-offset-4 hover:underline"
    >
      {children}
    </button>
  );
}

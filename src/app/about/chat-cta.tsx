"use client";

import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCrispChat } from "@/lib/crisp";

/**
 * Opens the Crisp support widget. Safe no-op when Crisp isn't configured
 * (NEXT_PUBLIC_CRISP_WEBSITE_ID unset) — same pattern as the legal pages.
 */
export function ChatCta() {
  return (
    <Button onClick={openCrispChat} size="lg">
      <MessageCircle className="h-4 w-4" />
      Chat with us
    </Button>
  );
}

/** Inline text link that opens the Crisp widget. Same safe no-op behaviour. */
export function ChatLink({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={openCrispChat}
      className="font-medium text-violet-500 underline-offset-4 hover:underline"
    >
      {children}
    </button>
  );
}

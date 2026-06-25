"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { discardConversationDraft } from "@/lib/firestore/conversations";
import type { Contact } from "@/types/contacts";
import type { ConversationDraft } from "@/types/conversations";

const LABEL = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
} as const;

/**
 * Suggest-mode draft awaiting approval. The operator can edit the text, then
 * Approve & send (posts to the existing channel send route — the human-send
 * upsert clears the draft + pauses the bot server-side) or Discard.
 */
export function ConversationDraftCard({
  contact,
  draft,
}: {
  contact: Contact;
  draft: ConversationDraft;
}) {
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<null | "approve" | "discard">(null);
  const endpoint =
    draft.channel === "sms"
      ? "/api/comms/sms/send"
      : "/api/comms/whatsapp/send";

  async function approve() {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy("approve");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, body: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't send.");
      // The send route's human-reply upsert clears pendingDraft server-side.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    setBusy("discard");
    try {
      await discardConversationDraft(contact.id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <Sparkles className="h-3.5 w-3.5" />
        AI suggested reply · {LABEL[draft.channel]} · edit before sending
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="resize-none bg-background text-sm"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={discard}
          disabled={!!busy}
        >
          {busy === "discard" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="mr-1 h-3.5 w-3.5" />
          )}
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={approve}
          disabled={!!busy || !body.trim()}
        >
          {busy === "approve" ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="mr-1 h-3.5 w-3.5" />
          )}
          Approve &amp; send
        </Button>
      </div>
    </div>
  );
}

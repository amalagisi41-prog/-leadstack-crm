"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  MessagesSquare,
  PanelRight,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { useConversationTheme } from "@/hooks/use-conversation-theme";
import { cn } from "@/lib/utils";
import { subscribeToContact } from "@/lib/firestore/contacts";
import {
  markConversationRead,
  subscribeToConversation,
} from "@/lib/firestore/conversations";
import { Button } from "@/components/ui/button";
import { ConversationThread } from "@/components/conversations/conversation-thread";
import { ConversationComposer } from "@/components/conversations/conversation-composer";
import { ConversationAiControls } from "@/components/conversations/conversation-ai-controls";
import { ConversationDraftCard } from "@/components/conversations/conversation-draft-card";
import { ConversationContactPanel } from "@/components/conversations/conversation-contact-panel";
import type { Contact } from "@/types/contacts";
import type { ConversationChannel, ConversationDoc } from "@/types/conversations";

const PANEL_KEY = "ls.convo.detailsPanel";

export default function ConversationDetailPage() {
  const params = useParams<{ contactId: string }>();
  const contactId = params.contactId;
  const { user, loading: authLoading } = useAuth();
  const { subAccount, saPath } = useSubAccount();
  const { theme, setTheme } = useConversationTheme();
  const [contact, setContact] = useState<Contact | null>(null);
  const [conversation, setConversation] = useState<ConversationDoc | null>(null);
  const [loading, setLoading] = useState(true);
  // Right-hand contact panel — collapsed by default; remembered across
  // conversations via localStorage (desktop only; hidden under lg).
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    try {
      setPanelOpen(localStorage.getItem(PANEL_KEY) === "1");
    } catch {
      /* localStorage unavailable — keep default closed */
    }
  }, []);

  function togglePanel() {
    setPanelOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PANEL_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  useEffect(() => {
    if (authLoading || !user || !contactId) return;
    setLoading(true);
    const unsubContact = subscribeToContact(contactId, (c) => {
      setContact(c);
      setLoading(false);
    });
    const unsubConv = subscribeToConversation(contactId, setConversation);
    return () => {
      unsubContact();
      unsubConv();
    };
  }, [contactId, user, authLoading]);

  // Reset the unread counter as soon as the operator opens the thread.
  useEffect(() => {
    if (contactId) void markConversationRead(contactId);
  }, [contactId]);

  const availableChannels: ConversationChannel[] = [];
  if (subAccount?.twilioConfig?.enabled) availableChannels.push("sms");
  if (
    subAccount?.twilioConfig?.whatsappFromNumber &&
    subAccount?.whatsappEnabledByAgency === true
  ) {
    availableChannels.push("whatsapp");
  }
  // BETA Meta channels — offered only when the agency gate is on, a Page is
  // connected, this contact has a Meta identity, and they've actually used the
  // channel (so we never expose a reply path the recipient can't receive).
  if (
    subAccount?.metaInboxEnabledByAgency === true &&
    subAccount?.metaConfig?.connected &&
    contact?.metaUserId
  ) {
    for (const ch of conversation?.channelsSeen ?? []) {
      if (
        (ch === "messenger" || ch === "instagram") &&
        !availableChannels.includes(ch)
      ) {
        availableChannels.push(ch);
      }
    }
  }

  const title = contact?.name || contact?.phone || "Conversation";

  return (
    <div
      className={cn(
        "mx-auto flex h-[calc(100vh-9rem)] min-h-[480px] w-full gap-4",
        panelOpen ? "max-w-4xl lg:max-w-6xl xl:max-w-7xl" : "max-w-4xl",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card">
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            render={<Link href={saPath("/conversations")} />}
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MessagesSquare className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {contact?.phone ?? ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={theme === "native"}
            onClick={() =>
              setTheme(theme === "native" ? "standard" : "native")
            }
            title="Restyle the thread to each channel's native look"
            className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Native</span>
            <span
              className={cn(
                "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                theme === "native" ? "bg-primary" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform",
                  theme === "native" ? "translate-x-3.5" : "translate-x-0.5",
                )}
              />
            </span>
          </button>
          {contact && (
            <Button
              variant={panelOpen ? "secondary" : "outline"}
              size="sm"
              onClick={togglePanel}
              aria-pressed={panelOpen}
              className="hidden lg:inline-flex"
              title="Show contact details + activity"
            >
              <PanelRight className="mr-1 h-3.5 w-3.5" />
              Details
            </Button>
          )}
          {contact && (
            <Button
              variant="outline"
              size="sm"
              render={<Link href={saPath(`/contacts/${contact.id}`)} />}
            >
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Contact
            </Button>
          )}
        </div>
      </header>

      {loading || !contact ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading conversation…</p>
        </div>
      ) : (
        <>
          {conversation && (
            <ConversationAiControls conversation={conversation} />
          )}
          <ConversationThread contactId={contactId} theme={theme} />
          {conversation?.pendingDraft && (
            <ConversationDraftCard
              contact={contact}
              draft={conversation.pendingDraft}
            />
          )}
          <ConversationComposer
            contact={contact}
            availableChannels={availableChannels}
            defaultChannel={conversation?.lastChannel ?? "sms"}
          />
        </>
      )}
      </div>

      {panelOpen && contact && (
        <aside className="hidden w-[340px] shrink-0 overflow-hidden rounded-2xl border bg-card lg:block">
          <ConversationContactPanel contact={contact} onClose={togglePanel} />
        </aside>
      )}
    </div>
  );
}

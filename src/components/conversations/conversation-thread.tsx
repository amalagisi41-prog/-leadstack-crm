"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { CheckCheck } from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MessageDoc } from "@/types/messages";
import type { ConversationChannel } from "@/types/conversations";
import type { ConversationTheme } from "@/hooks/use-conversation-theme";

type ChannelMessage = MessageDoc & { channel: ConversationChannel };

const CHANNEL_LABEL: Record<ConversationChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
};

const CHANNEL_CHIP: Record<ConversationChannel, string> = {
  sms: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  whatsapp: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  messenger: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  instagram: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
};

/** Meta rows carry their own channel discriminator on the doc. */
type MetaMessageDoc = MessageDoc & { channel?: ConversationChannel };

/**
 * The merged conversation timeline. Subscribes to the contact's SMS
 * (`messages`), WhatsApp (`whatsappMessages`), and BETA Meta (`metaMessages`,
 * Messenger + Instagram) subcollections, tags each row with its channel, and
 * renders one time-ordered stream. No data is moved — this is a read-time merge
 * over the existing per-contact threads.
 */
export function ConversationThread({
  contactId,
  theme = "standard",
}: {
  contactId: string;
  theme?: ConversationTheme;
}) {
  const [sms, setSms] = useState<MessageDoc[]>([]);
  const [wa, setWa] = useState<MessageDoc[]>([]);
  const [meta, setMeta] = useState<MetaMessageDoc[]>([]);
  const [smsReady, setSmsReady] = useState(false);
  const [waReady, setWaReady] = useState(false);
  const [metaReady, setMetaReady] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contactId) return;
    const db = getFirebaseDb();
    const unsubSms = onSnapshot(
      query(
        collection(db, `contacts/${contactId}/messages`),
        orderBy("createdAt", "asc"),
      ),
      (snap) => {
        setSms(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessageDoc));
        setSmsReady(true);
      },
      () => setSmsReady(true),
    );
    const unsubWa = onSnapshot(
      query(
        collection(db, `contacts/${contactId}/whatsappMessages`),
        orderBy("createdAt", "asc"),
      ),
      (snap) => {
        setWa(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MessageDoc));
        setWaReady(true);
      },
      () => setWaReady(true),
    );
    const unsubMeta = onSnapshot(
      query(
        collection(db, `contacts/${contactId}/metaMessages`),
        orderBy("createdAt", "asc"),
      ),
      (snap) => {
        setMeta(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MetaMessageDoc),
        );
        setMetaReady(true);
      },
      () => setMetaReady(true),
    );
    return () => {
      unsubSms();
      unsubWa();
      unsubMeta();
    };
  }, [contactId]);

  const merged = useMemo<ChannelMessage[]>(() => {
    const all: ChannelMessage[] = [
      ...sms.map((m) => ({ ...m, channel: "sms" as const })),
      ...wa.map((m) => ({ ...m, channel: "whatsapp" as const })),
      ...meta.map((m) => ({
        ...m,
        channel: (m.channel ?? "messenger") as ConversationChannel,
      })),
    ];
    all.sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    return all;
  }, [sms, wa, meta]);

  const hydrated = smsReady && waReady && metaReady;

  useEffect(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [merged.length]);

  return (
    <div
      ref={scrollerRef}
      className="flex-1 space-y-2 overflow-y-auto p-4"
    >
      {!hydrated ? (
        <div className="space-y-2">
          <div className="h-12 w-2/3 animate-pulse rounded-lg bg-muted" />
          <div className="ml-auto h-12 w-3/4 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : merged.length === 0 ? (
        <div className="flex h-full min-h-[150px] items-center justify-center text-center">
          <p className="text-xs text-muted-foreground">
            No messages yet. Reply below to start the conversation.
          </p>
        </div>
      ) : (
        merged.map((m) => (
          <ChannelBubble key={`${m.channel}:${m.id}`} message={m} theme={theme} />
        ))
      )}
    </div>
  );
}

/** Bubble color classes per (theme, channel, direction). */
function bubbleClasses(
  channel: ConversationChannel,
  isOutbound: boolean,
  theme: ConversationTheme,
): string {
  if (theme === "native") {
    if (channel === "whatsapp") {
      return isOutbound
        ? "rounded-br-sm bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-white"
        : "rounded-bl-sm bg-white text-[#111b21] ring-1 ring-black/5 dark:bg-[#202c33] dark:text-[#e9edef] dark:ring-0";
    }
    if (channel === "messenger") {
      // Messenger → blue outbound bubble
      return isOutbound
        ? "rounded-br-sm bg-[#0084ff] text-white"
        : "rounded-bl-sm bg-[#e9e9eb] text-black dark:bg-[#3b3b3d] dark:text-white";
    }
    if (channel === "instagram") {
      // Instagram → purple/gradient outbound bubble
      return isOutbound
        ? "rounded-br-sm bg-gradient-to-br from-[#a033ff] via-[#ff5280] to-[#ff7061] text-white"
        : "rounded-bl-sm bg-[#efefef] text-black dark:bg-[#3b3b3d] dark:text-white";
    }
    // SMS → iMessage palette
    return isOutbound
      ? "rounded-br-sm bg-[#007aff] text-white"
      : "rounded-bl-sm bg-[#e9e9eb] text-black dark:bg-[#3b3b3d] dark:text-white";
  }
  // Standard / brand
  return isOutbound
    ? "rounded-br-sm bg-primary text-primary-foreground"
    : "rounded-bl-sm bg-muted";
}

function ChannelBubble({
  message,
  theme,
}: {
  message: ChannelMessage;
  theme: ConversationTheme;
}) {
  const isOutbound = message.direction === "outbound";
  const ts = toDate(message.createdAt);
  const native = theme === "native";
  const channelLabel = CHANNEL_LABEL[message.channel] ?? message.channel;
  // Native: color conveys the channel, so drop the text chip; WhatsApp outbound
  // gets the recognizable double-tick (cosmetic "delivered" cue).
  const showTicks =
    native && isOutbound && message.channel === "whatsapp" &&
    message.status !== "failed";

  return (
    <div className={cn("flex flex-col", isOutbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
          bubbleClasses(message.channel, isOutbound, theme),
          message.status === "failed" && "ring-2 ring-destructive",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {!native && (
          <span
            className={cn(
              "rounded-full px-1.5 font-medium",
              CHANNEL_CHIP[message.channel] ?? CHANNEL_CHIP.sms,
            )}
          >
            {channelLabel}
          </span>
        )}
        <span>
          {ts
            ? ts.toLocaleString(undefined, {
                hour: "numeric",
                minute: "2-digit",
                month: "short",
                day: "numeric",
              })
            : ""}
        </span>
        {showTicks && (
          <CheckCheck
            className="h-3 w-3 text-sky-500"
            aria-label="delivered"
          />
        )}
        {message.status === "failed" && (
          <span className="text-destructive">· failed</span>
        )}
      </div>
    </div>
  );
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}

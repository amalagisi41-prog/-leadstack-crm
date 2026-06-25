"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { segmentInfo } from "@/lib/comms/sms-segments";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contacts";
import type { MessageDoc } from "@/types/messages";

/**
 * Per-contact SMS chat thread. Only rendered when the parent sub-account has
 * `twilioConfig.enabled === true` (the parent contact-profile page guards
 * this so unconfigured sub-accounts don't even see the section).
 *
 * Real-time via onSnapshot. Outbound sends hit /api/comms/sms/send which
 * (in dedicated mode) writes a message row server-side; the snapshot
 * surfaces it within the same render tick.
 *
 * On mount we mark currently-unread inbound messages as read by stamping
 * `readAt` on each — used for unread-badge math elsewhere.
 */
export function ContactMessagesThread({ contact }: { contact: Contact }) {
  const { subAccount } = useSubAccount();
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to the messages subcollection, ordered ascending so the most
  // recent message lands at the bottom of the thread.
  useEffect(() => {
    if (!contact.id) return;
    const db = getFirebaseDb();
    const q = query(
      collection(db, `contacts/${contact.id}/messages`),
      orderBy("createdAt", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as MessageDoc,
        );
        setMessages(rows);
        setHydrated(true);
      },
      () => setHydrated(true),
    );
    return () => unsub();
  }, [contact.id]);

  // Auto-scroll to the bottom when new messages arrive.
  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages.length]);

  // Mark unread inbound messages as read as soon as the thread is mounted.
  useEffect(() => {
    if (!hydrated || messages.length === 0) return;
    const unread = messages.filter(
      (m) => m.direction === "inbound" && !m.readAt,
    );
    if (unread.length === 0) return;
    const db = getFirebaseDb();
    Promise.all(
      unread.map((m) =>
        setDoc(
          doc(db, `contacts/${contact.id}/messages/${m.id}`),
          { readAt: serverTimestamp() },
          { merge: true },
        ),
      ),
    ).catch((err) => {
      console.warn("[messages] mark-read failed", err);
    });
  }, [hydrated, messages, contact.id]);

  const info = useMemo(() => segmentInfo(body), [body]);
  const remainingInSegment =
    info.segments === 0
      ? info.perSegment
      : info.perSegment * info.segments - info.length;

  const optedOut = !!contact.smsOptedOut;
  const fromNumber = subAccount?.twilioConfig?.fromNumber ?? "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    if (!contact.phone) {
      toast.error("This contact has no phone number.");
      return;
    }
    if (optedOut) {
      toast.error("This contact has opted out of SMS.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/comms/sms/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, body: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Couldn't send.");
      }
      setBody("");
      // Snapshot listener will append the row.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <MessageSquare className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Messages</h2>
            <p className="text-[11px] text-muted-foreground">
              SMS thread with {contact.name || contact.phone}.
              {fromNumber ? ` From ${fromNumber}.` : ""}
            </p>
          </div>
        </div>
        {optedOut && (
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">
            Opted out
          </span>
        )}
      </header>

      <div
        ref={scrollerRef}
        className="max-h-[420px] min-h-[200px] space-y-2 overflow-y-auto p-4"
      >
        {!hydrated ? (
          <div className="space-y-2">
            <div className="h-12 w-2/3 animate-pulse rounded-lg bg-muted" />
            <div className="ml-auto h-12 w-3/4 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-[150px] items-center justify-center text-center">
            <p className="text-xs text-muted-foreground">
              No messages yet. Send an SMS to start the conversation —
              replies from {contact.phone} will land here in real time.
            </p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t px-4 py-3"
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            optedOut
              ? "Contact opted out of SMS"
              : `Reply to ${contact.phone}…`
          }
          rows={2}
          disabled={optedOut || sending || !contact.phone}
          className="resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-[11px] tabular-nums",
              info.segments > 1
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {info.length} chars ·{" "}
            {info.segments === 0
              ? "0 segments"
              : `${info.segments} segment${info.segments === 1 ? "" : "s"}`}
            {info.segments > 0 && ` · ${remainingInSegment} left`}
            {info.encoding === "UCS-2" && " · Unicode"}
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={!body.trim() || sending || optedOut || !contact.phone}
          >
            {sending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            Send
          </Button>
        </div>
      </form>
    </section>
  );
}

function MessageBubble({ message }: { message: MessageDoc }) {
  const isOutbound = message.direction === "outbound";
  const ts = toDate(message.createdAt);
  return (
    <div
      className={cn(
        "flex flex-col",
        isOutbound ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm",
          isOutbound
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted",
          message.status === "failed" && "ring-2 ring-destructive",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
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
        {message.status === "failed" && (
          <span className="text-destructive">· failed</span>
        )}
      </div>
    </div>
  );
}

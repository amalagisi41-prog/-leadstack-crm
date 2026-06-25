import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type {
  ConversationBotMode,
  ConversationDoc,
} from "@/types/conversations";

const CONVERSATIONS = "conversations";

/**
 * Live list of conversations for a sub-account. Filters on subAccountId only
 * and sorts by lastMessageAt client-side — same convention as
 * subscribeToContacts, which avoids a composite index.
 */
export function subscribeToConversations(
  subAccountId: string,
  callback: (conversations: ConversationDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), CONVERSATIONS),
    where("subAccountId", "==", subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<ConversationDoc, "id">) }),
      );
      rows.sort((a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt));
      callback(rows);
    },
    (err) => onError?.(err),
  );
}

/** Live single conversation (doc id == contactId). */
export function subscribeToConversation(
  contactId: string,
  callback: (conversation: ConversationDoc | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), CONVERSATIONS, contactId),
    (snap) => {
      callback(
        snap.exists()
          ? { id: snap.id, ...(snap.data() as Omit<ConversationDoc, "id">) }
          : null,
      );
    },
    (err) => onError?.(err),
  );
}

/**
 * Reset the conversation's unread counter. Called when an operator opens the
 * thread. Best-effort — a blip here just leaves a stale badge, never blocks.
 * Rules permit clients to update only the operator-facing field set.
 */
export async function markConversationRead(contactId: string): Promise<void> {
  try {
    await updateDoc(doc(getFirebaseDb(), CONVERSATIONS, contactId), {
      unreadCount: 0,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[conversations] mark-read failed", err);
  }
}

/** Set the per-conversation AI mode (off / suggest / auto). */
export async function setConversationBotMode(
  contactId: string,
  mode: ConversationBotMode,
): Promise<void> {
  try {
    await updateDoc(doc(getFirebaseDb(), CONVERSATIONS, contactId), {
      botMode: mode,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[conversations] set bot mode failed", err);
  }
}

/** Clear a bot pause so the AI can resume replying on this conversation. */
export async function resumeBot(contactId: string): Promise<void> {
  try {
    await updateDoc(doc(getFirebaseDb(), CONVERSATIONS, contactId), {
      botPausedUntil: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[conversations] resume bot failed", err);
  }
}

/** Discard a pending suggest-mode draft without sending it. */
export async function discardConversationDraft(
  contactId: string,
): Promise<void> {
  try {
    await updateDoc(doc(getFirebaseDb(), CONVERSATIONS, contactId), {
      pendingDraft: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[conversations] discard draft failed", err);
  }
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}

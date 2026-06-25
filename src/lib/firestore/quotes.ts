import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import {
  NOOP_UNSUB,
  territoryQueryPlan,
} from "@/lib/firestore/territory-query";
import type { Quote } from "@/types/quotes";
import type { TenantScope } from "@/types";

/**
 * Client-side CRUD + subscriptions for the `quotes` collection.
 *
 * Read paths (subscribe* helpers) use the Firebase Web SDK and respect
 * the per-sub-account Firestore rules: only members of the requested
 * sub-account get a non-empty snapshot. The shape mirrors the existing
 * deals / events / tasks helpers — same `TenantScope` wrapper, same
 * onSnapshot streaming pattern.
 *
 * Writes are intentionally limited here to OPERATIONS THE OPERATOR UI
 * needs to call directly from the browser:
 *   - updateDraftQuote  → builder form auto-save
 *   - deleteQuote       → list-page actions
 *
 * Anything that flips lifecycle state (send, mark paid, accept,
 * decline) goes through a server-side API route that ALSO writes the
 * activity-timeline row + fires automation triggers atomically. Those
 * helpers live in src/lib/quotes/* + src/app/api/sub-accounts/[id]/quotes/*
 * and use the Admin SDK, not this file.
 *
 * CREATE is also server-side — the create flow needs to issue a
 * per-sub-account sequence number atomically (see lib/quotes/number.ts)
 * which the client SDK can't do safely.
 */

const QUOTES = "quotes";

export interface QuoteQueryOptions {
  /** Territory filter for scoped collaborators. `null` (default) = no
   *  filter. See deals.ts for the full contract. */
  territoryFilter?: string[] | null;
}

export function subscribeToQuotes(
  scope: TenantScope,
  callback: (quotes: Quote[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe;
export function subscribeToQuotes(
  scope: TenantScope,
  opts: QuoteQueryOptions,
  callback: (quotes: Quote[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe;
export function subscribeToQuotes(
  scope: TenantScope,
  callbackOrOpts: ((quotes: Quote[]) => void) | QuoteQueryOptions,
  callbackOrError?: ((quotes: Quote[]) => void) | ((err: Error) => void),
  onErrorMaybe?: (err: Error) => void,
): Unsubscribe {
  const opts: QuoteQueryOptions =
    typeof callbackOrOpts === "function" ? {} : callbackOrOpts;
  const callback: (quotes: Quote[]) => void =
    typeof callbackOrOpts === "function"
      ? callbackOrOpts
      : (callbackOrError as (quotes: Quote[]) => void);
  const onError: ((err: Error) => void) | undefined =
    typeof callbackOrOpts === "function"
      ? (callbackOrError as ((err: Error) => void) | undefined)
      : onErrorMaybe;

  const plan = territoryQueryPlan(opts.territoryFilter);
  if (plan.mode === "empty") {
    callback([]);
    return NOOP_UNSUB;
  }
  const constraints: QueryConstraint[] = [
    where("subAccountId", "==", scope.subAccountId),
  ];
  if (plan.mode === "in") constraints.push(plan.constraint);
  const q = query(collection(getFirebaseDb(), QUOTES), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      const quotes = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<Quote, "id">) }),
      );
      // Newest first by createdAt — list page can re-sort client-side
      // if it wants different ordering (e.g. by status pill).
      quotes.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(quotes);
    },
    (err) => onError?.(err),
  );
}

export function subscribeToQuotesForContact(
  contactId: string,
  scope: TenantScope,
  callback: (quotes: Quote[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), QUOTES),
    where("subAccountId", "==", scope.subAccountId),
    where("contactId", "==", contactId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const quotes = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<Quote, "id">) }),
      );
      quotes.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(quotes);
    },
    (err) => onError?.(err),
  );
}

export function subscribeToQuote(
  id: string,
  callback: (quote: Quote | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), QUOTES, id),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...(snap.data() as Omit<Quote, "id">) });
    },
    (err) => onError?.(err),
  );
}

/**
 * Update fields on a quote that's still in draft. Rejects silently if
 * the quote isn't in draft state — Firestore rules will enforce the
 * same gate server-side, but this client-side check saves a round-trip
 * for the common "operator edited a sent quote inline" case.
 *
 * v1 INTENTIONALLY ALLOWS edits on sent quotes too (matches GHL — see
 * the spec decision in CLAUDE.md). The argument here is named
 * `updateDraftQuote` for legacy/future reasons, but the implementation
 * doesn't gate on status. If we ever switch to revision-locked mode,
 * add the gate here + rules update.
 */
export async function updateDraftQuote(
  id: string,
  patch: Partial<
    Pick<
      Quote,
      | "lineItems"
      | "globalDiscount"
      | "globalTaxPercent"
      | "termsAndNotes"
      | "billedToOrganization"
      | "billingAddress"
      | "validUntil"
      | "paymentDueDays"
      | "currency"
      | "autoCreateDealOnAccept"
    >
  >,
): Promise<void> {
  await updateDoc(doc(getFirebaseDb(), QUOTES, id), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/** Hard delete. Only meaningful for draft quotes — once a quote has
 *  been sent, the operator should mark it declined / paid instead so
 *  the activity history stays intact. UI enforces this; this helper
 *  doesn't (Firestore rules + UI are the gates). */
export async function deleteQuote(id: string): Promise<void> {
  await deleteDoc(doc(getFirebaseDb(), QUOTES, id));
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

/**
 * Activation gate state. Driven primarily by whether `GITPAGE_API_KEY`
 * is set — if the operator pasted a key, we trust it. The heartbeat's
 * email-based subscription check is unreliable in practice (the gitpage
 * subscription email often doesn't match the LeadStack agency owner's
 * email) so it's relegated to telemetry rather than UI gating. If a key
 * turns out to be invalid, the build route's 401 handler flips us to
 * `subscribe-needed` with `lastError: "401_invalid_api_key"`.
 */
export type GitpageGateState =
  | { kind: "unknown" } // first load, no doc yet — render normally
  | { kind: "ready" } // operator has pasted a key
  | { kind: "subscribe-needed"; lastError: string | null };

interface GitpageStatusDoc {
  agency?: boolean;
  hasApiKey?: boolean;
  lastCheckedAt?: Timestamp | null;
  lastError?: string | null;
  /** Stamped when a real build POST is accepted (202). Diagnostic only. */
  lastBuildAcceptedAt?: Timestamp | null;
}

/**
 * Subscribes to `system/gitpageStatus` and returns the derived activation
 * gate state. Read-only — refresh / mutate via the API endpoint.
 */
export function useGitpageStatus() {
  const [doc_, setDoc] = useState<GitpageStatusDoc | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const ref = doc(getFirebaseDb(), "system/gitpageStatus");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setDoc(snap.exists() ? (snap.data() as GitpageStatusDoc) : null);
        setHydrated(true);
      },
      () => setHydrated(true),
    );
    return () => unsub();
  }, []);

  const state = useMemo<GitpageGateState>(() => {
    if (!hydrated) return { kind: "unknown" };
    if (!doc_) return { kind: "unknown" };
    if (doc_.hasApiKey === true) return { kind: "ready" };
    return {
      kind: "subscribe-needed",
      lastError: doc_.lastError ?? null,
    };
  }, [hydrated, doc_]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/agency/refresh-gitpage-status", {
      method: "POST",
    });
    return res.ok;
  }, []);

  return { state, refresh, hydrated };
}

/** UTM-tagged subscription URL. Constant — exported for reuse in banners. */
export const GITPAGE_SUBSCRIBE_URL =
  "https://www.gitpage.site/?showPricing=true&utm_source=leadstack&utm_medium=in_app";

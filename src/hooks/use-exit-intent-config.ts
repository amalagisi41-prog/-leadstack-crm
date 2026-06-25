"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  coerceExitIntentConfig,
  EXIT_INTENT_DEFAULTS,
  type ExitIntentConfig,
} from "@/lib/exit-intent-config";

export interface ExitIntentConfigState extends ExitIntentConfig {
  /** False until the first Firestore read resolves. Gate arming on this so
   *  the popup doesn't flash for an offer the operator has switched off. */
  hydrated: boolean;
}

/**
 * Live subscription to the exit-intent offer config (`appConfig/exitIntentModal`).
 * Mirrors {@link useFoundersCohort}: onSnapshot so an edit on /agency/landing
 * reflects on the public landing without a redeploy. Falls back to the shipped
 * defaults when Firebase is unconfigured or the doc is missing.
 */
export function useExitIntentConfig(): ExitIntentConfigState {
  const [state, setState] = useState<ExitIntentConfigState>({
    ...EXIT_INTENT_DEFAULTS,
    hydrated: false,
  });

  useEffect(() => {
    const fallback = () => setState({ ...EXIT_INTENT_DEFAULTS, hydrated: true });
    if (!isFirebaseConfigured()) return fallback();

    let db;
    try {
      db = getFirebaseDb();
    } catch {
      return fallback();
    }

    const unsub = onSnapshot(
      doc(db, "appConfig/exitIntentModal"),
      (snap) =>
        setState({
          ...coerceExitIntentConfig(
            snap.data() as Partial<ExitIntentConfig> | undefined,
          ),
          hydrated: true,
        }),
      fallback,
    );
    return () => unsub();
  }, []);

  return state;
}

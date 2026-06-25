"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseDb, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  coerceUpdatesModalConfig,
  UPDATES_MODAL_DEFAULTS,
  type UpdatesModalConfig,
} from "@/lib/updates-modal-config";

export interface UpdatesModalConfigState extends UpdatesModalConfig {
  /** False until the first Firestore read resolves. Gate showing on this so
   *  the modal doesn't flash for content the operator has switched off. */
  hydrated: boolean;
}

/**
 * Live subscription to the updates-modal config (`appConfig/updatesModal`).
 * Mirrors {@link useExitIntentConfig}: onSnapshot so an edit on /agency/landing
 * reflects on the public landing without a redeploy. Falls back to the shipped
 * defaults when Firebase is unconfigured or the doc is missing.
 */
export function useUpdatesModalConfig(): UpdatesModalConfigState {
  const [state, setState] = useState<UpdatesModalConfigState>({
    ...UPDATES_MODAL_DEFAULTS,
    hydrated: false,
  });

  useEffect(() => {
    const fallback = () =>
      setState({ ...UPDATES_MODAL_DEFAULTS, hydrated: true });
    if (!isFirebaseConfigured()) return fallback();

    let db;
    try {
      db = getFirebaseDb();
    } catch {
      return fallback();
    }

    const unsub = onSnapshot(
      doc(db, "appConfig/updatesModal"),
      (snap) =>
        setState({
          ...coerceUpdatesModalConfig(
            snap.data() as Partial<UpdatesModalConfig> | undefined,
          ),
          hydrated: true,
        }),
      fallback,
    );
    return () => unsub();
  }, []);

  return state;
}

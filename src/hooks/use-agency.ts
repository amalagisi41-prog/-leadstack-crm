"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { AgencyDoc } from "@/types";

interface AgencySummary {
  /** Agency display name. Falls back to "LeadStack" until hydrated. */
  name: string;
  /** Optional logo URL — when set, sidebar swaps the LeadStack chevron mark for this. */
  logoUrl: string | null;
  /** Public support / contact email. Null until set in Agency → Settings. */
  supportEmail: string | null;
  /** Bare public domain (no scheme). Null until set in Agency → Settings. */
  primaryDomain: string | null;
  /** True until the Firestore snapshot has resolved. UI shouldn't render brand chrome before this flips false. */
  loading: boolean;
}

interface AgencyData {
  name: string;
  logoUrl: string | null;
  supportEmail: string | null;
  primaryDomain: string | null;
}

/**
 * Live subscription to the current agency doc — drives the dashboard chrome
 * (sidebar logo + wordmark, browser tab title) AND hydrates the Agency →
 * Settings branding form. Returns sensible defaults before hydration so
 * SSR matches the first client paint.
 */
export function useAgency(): AgencySummary {
  const { agencyId } = useAuth();
  const [data, setData] = useState<AgencyData>({
    name: "LeadStack",
    logoUrl: null,
    supportEmail: null,
    primaryDomain: null,
  });
  const [loading, setLoading] = useState<boolean>(!!agencyId);

  useEffect(() => {
    if (!agencyId) {
      setLoading(false);
      return;
    }
    const ref = doc(getFirebaseDb(), `agencies/${agencyId}`);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() as Partial<AgencyDoc>;
          setData({
            name: (d.name as string) || "LeadStack",
            logoUrl: (d.logoUrl as string | null) ?? null,
            supportEmail: (d.supportEmail as string | null) ?? null,
            primaryDomain: (d.primaryDomain as string | null) ?? null,
          });
        }
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [agencyId]);

  return { ...data, loading };
}

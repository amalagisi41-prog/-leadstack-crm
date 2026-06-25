"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { useAuth } from "@/hooks/use-auth";
import type { SubAccountDoc, SubAccountRole } from "@/types";

export interface SubAccountContextValue {
  subAccountId: string;
  subAccount: SubAccountDoc | null;
  loading: boolean;
  /**
   * The caller's effective role inside this sub-account. Agency owners are
   * resolved to "admin" automatically.
   */
  myRole: SubAccountRole | null;
  isAdmin: boolean;
  agencyId: string | null;
  /**
   * Prefix a relative dashboard path with the active sub-account segment,
   * e.g. saPath("/contacts") -> "/sa/abc123/contacts". Use this for every
   * in-app navigation so links stay scoped to the current sub-account.
   */
  saPath: (path: string) => string;
}

const SubAccountContext = createContext<SubAccountContextValue | undefined>(
  undefined,
);

export function SubAccountProvider({
  subAccountId,
  children,
}: {
  subAccountId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const {
    user,
    agencyId: claimAgencyId,
    agencyRole,
    memberships,
    membershipsLoaded,
    loading: authLoading,
  } = useAuth();
  const [subAccount, setSubAccount] = useState<SubAccountDoc | null>(null);
  const [subLoading, setSubLoading] = useState(true);

  useEffect(() => {
    if (!user || !subAccountId) {
      setSubAccount(null);
      setSubLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(getFirebaseDb(), "subAccounts", subAccountId),
      (snap) => {
        if (!snap.exists()) {
          setSubAccount(null);
          setSubLoading(false);
          return;
        }
        setSubAccount(snap.data() as SubAccountDoc);
        setSubLoading(false);
      },
      () => {
        setSubAccount(null);
        setSubLoading(false);
      },
    );
    return () => unsub();
  }, [user, subAccountId]);

  // Compute role + access. Agency owners always pass.
  const ownerForThisAgency =
    agencyRole === "owner" &&
    !!subAccount &&
    !!claimAgencyId &&
    subAccount.agencyId === claimAgencyId;
  const membership = memberships.find((m) => m.subAccountId === subAccountId);
  const myRole: SubAccountRole | null = ownerForThisAgency
    ? "admin"
    : (membership?.role ?? null);
  const isAdmin = ownerForThisAgency || myRole === "admin";

  // No-access redirect: only fire after auth + sub-account snapshots resolve,
  // and only if neither the agency-owner shortcut nor a membership covers us.
  useEffect(() => {
    if (authLoading || subLoading) return;
    // Wait for memberships to actually arrive — `authLoading` flips false
    // before the membership snapshot lands, so without this a refresh would
    // bounce a valid collaborator to no-access against an empty list.
    if (!membershipsLoaded) return;
    if (!user) return;
    if (!subAccount) return; // sub-account doesn't exist; let the page handle it
    if (ownerForThisAgency) return;
    if (membership) return;
    router.replace("/agency?error=no-access");
  }, [
    authLoading,
    subLoading,
    membershipsLoaded,
    user,
    subAccount,
    ownerForThisAgency,
    membership,
    router,
  ]);

  const value: SubAccountContextValue = {
    subAccountId,
    subAccount,
    // Include membershipsLoaded so consumers don't read a stale myRole /
    // isAdmin (both derived from `membership`) before memberships arrive.
    loading: authLoading || subLoading || !membershipsLoaded,
    myRole,
    isAdmin,
    agencyId: subAccount?.agencyId ?? claimAgencyId,
    saPath: (path: string) => {
      if (!path.startsWith("/")) return path;
      return `/sa/${subAccountId}${path}`;
    },
  };

  return (
    <SubAccountContext.Provider value={value}>
      {children}
    </SubAccountContext.Provider>
  );
}

export function useSubAccount(): SubAccountContextValue {
  const ctx = useContext(SubAccountContext);
  if (!ctx) {
    throw new Error("useSubAccount must be used within a SubAccountProvider");
  }
  return ctx;
}

/**
 * Like useSubAccount() but returns null when no provider is mounted.
 * Useful for components shared between agency-level and sub-account-level
 * pages (e.g. the global header).
 */
export function useOptionalSubAccount(): SubAccountContextValue | null {
  return useContext(SubAccountContext) ?? null;
}

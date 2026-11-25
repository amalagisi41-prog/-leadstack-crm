"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseDb,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import { signOutUser } from "@/lib/firebase/auth";
import type {
  AgencyRole,
  AppConfig,
  MemberStatus,
  Role,
  UserDoc,
  UserSubAccountMembership,
} from "@/types";

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /**
   * Legacy single-tenant pointer — the workspace owner's uid (the first
   * signup). Still consumed by the existing dashboard pages until Phase 2's
   * routing migration. Going forward, scope reads/writes by `subAccountId`
   * via `useSubAccount()` instead.
   */
  adminUid: string | null;
  /** Legacy role claim (admin | collaborator). Sub-account roles are per-sub-account. */
  role: Role | null;
  status: MemberStatus | null;
  /** Tenancy: the user's home agency. */
  agencyId: string | null;
  /** Tenancy: agency-level role (only owners are populated in v1). */
  agencyRole: AgencyRole | null;
  /**
   * Per-user denormalized index of every sub-account this user is a member
   * of. Powers the sub-account switcher dropdown. Empty array while loading.
   */
  memberships: UserSubAccountMembership[];
  /**
   * False until the membership subscription has delivered its first
   * snapshot. `loading` flips to false as soon as the auth token + user doc
   * resolve — which is BEFORE memberships arrive — so anything that decides
   * access from `memberships` (e.g. the sub-account no-access redirect) must
   * gate on this, or it will act against an empty list on refresh.
   */
  membershipsLoaded: boolean;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<MemberStatus | null>(null);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [agencyRole, setAgencyRole] = useState<AgencyRole | null>(null);
  const [memberships, setMemberships] = useState<UserSubAccountMembership[]>(
    []
  );
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      return;
    }

    let membershipUnsub: (() => void) | null = null;
    const cleanupMembership = () => {
      if (membershipUnsub) {
        membershipUnsub();
        membershipUnsub = null;
      }
    };

    const unsubscribe = onAuthStateChanged(
      getFirebaseAuth(),
      async (firebaseUser) => {
        setUser(firebaseUser);
        cleanupMembership();

        if (!firebaseUser) {
          setAdminUid(null);
          setRole(null);
          setStatus(null);
          setAgencyId(null);
          setAgencyRole(null);
          setMemberships([]);
          setMembershipsLoaded(true); // nothing to load — resolved
          setLoading(false);
          return;
        }

        // Re-gate: memberships for this user haven't arrived yet. Flips true
        // on the first membership snapshot (or on error) below.
        setMembershipsLoaded(false);

        try {
          // Make sure the token carries current custom claims (status,
          // agencyId, agencyRole) before any Firestore read fires — without
          // them rules deny the reads with "Missing or insufficient
          // permissions". This used to force a network refresh on EVERY page
          // load, a sequential round trip ahead of all data (measured as the
          // second step of the start-up waterfall). Now the cached token is
          // used unless its claims are missing or it was minted more than 10
          // minutes ago; a fresh signup/invite (no claims yet) and stale
          // claims after a role change still get the forced refresh.
          let tokenResult = await firebaseUser
            .getIdTokenResult(false)
            .catch(() => null);
          const cachedClaims = tokenResult?.claims;
          const issuedMs = tokenResult
            ? Date.parse(tokenResult.issuedAtTime)
            : 0;
          if (
            !cachedClaims ||
            cachedClaims.status !== "active" ||
            !cachedClaims.agencyId ||
            !Number.isFinite(issuedMs) ||
            Date.now() - issuedMs > 10 * 60 * 1000
          ) {
            tokenResult = await firebaseUser
              .getIdTokenResult(true)
              .catch(() => tokenResult);
          }
          const claims = tokenResult?.claims ?? {};

          const db = getFirebaseDb();

          // Subscribe to the user's sub-account memberships so the switcher
          // updates live when an admin adds/removes them somewhere. Started
          // IN PARALLEL with the profile reads below (it only needs the uid)
          // instead of after them — that ordering was a second sequential
          // Firestore round trip before any workspace page could load.
          membershipUnsub = subscribeMemberships(firebaseUser.uid);

          // The agency id/role are already on the token's claims, so publish
          // them now: workspace pages key their queries off agencyId and can
          // start in parallel with the profile reads below instead of after
          // them. (A removed user is still caught and signed out by the
          // status check below — rules deny any read they attempt meanwhile.)
          if (typeof claims.agencyId === "string" && claims.agencyId) {
            setAgencyId(claims.agencyId);
            setAgencyRole((claims.agencyRole as AgencyRole | null | undefined) ?? null);
          }

          const [cfgSnap, userSnap] = await Promise.all([
            getDoc(doc(db, "appConfig", "main")),
            getDoc(doc(db, "users", firebaseUser.uid)),
          ]);

          const cfg = cfgSnap.exists() ? (cfgSnap.data() as AppConfig) : null;
          const userDoc = userSnap.exists()
            ? (userSnap.data() as UserDoc)
            : null;

          if (!userDoc || userDoc.status !== "active") {
            // Removed/orphan user — sign them out hard.
            cleanupMembership();
            await signOutUser().catch(() => undefined);
            setAdminUid(null);
            setRole(null);
            setStatus("removed");
            setAgencyId(null);
            setAgencyRole(null);
            setMemberships([]);
            setMembershipsLoaded(true);
            setUser(null);
            if (typeof window !== "undefined") {
              window.location.href = "/login?reason=removed";
            }
            return;
          }

          setAdminUid(cfg?.adminUid ?? null);
          setRole(userDoc.role);
          setStatus(userDoc.status);

          let recoveredAgencyId =
            (claims.agencyId as string | undefined) ??
            userDoc.primaryAgencyId ??
            null;
          let recoveredAgencyRole =
            (claims.agencyRole as AgencyRole | null | undefined) ?? null;

          if (!recoveredAgencyId) {
            const agencyMemberships = await getDocs(
              collection(db, `userMemberships/${firebaseUser.uid}/agencies`)
            );

            const membershipDocs = agencyMemberships.docs
              .map((membershipDoc) => {
                const membership = membershipDoc.data() as {
                  agencyId?: string;
                  role?: AgencyRole;
                };
                const membershipAgencyId =
                  membership.agencyId?.trim() || membershipDoc.id.trim();
                if (!membershipAgencyId) {
                  return null;
                }
                return {
                  agencyId: membershipAgencyId,
                  role:
                    membership.role === "owner" || membership.role === "staff"
                      ? membership.role
                      : null,
                };
              })
              .filter(
                (
                  membership
                ): membership is {
                  agencyId: string;
                  role: AgencyRole | null;
                } => Boolean(membership)
              );

            const preferredMembership =
              membershipDocs.find(
                (membership) => membership.role === "owner"
              ) ??
              membershipDocs[0] ??
              null;

            recoveredAgencyId = preferredMembership?.agencyId ?? null;
            recoveredAgencyRole =
              preferredMembership?.role ?? recoveredAgencyRole;
          }

          setAgencyId(recoveredAgencyId);
          setAgencyRole(recoveredAgencyRole);

          // Fire-and-forget: claim any pending sub-account invites for
          // this user's email. Handles the "invited to multiple
          // sub-accounts after my first signup" case — the signup route
          // 409s for existing users, so this is the only path that
          // attaches the 2nd, 3rd, … memberships. Idempotent. The
          // membership subscription below picks up any new docs the
          // route writes without us needing to do anything extra.
          void fetch("/api/auth/claim-pending-invites", {
            method: "POST",
            credentials: "include",
          }).catch((err) => {
            console.warn("[auth] claim-pending-invites failed", err);
          });
        } catch (err) {
          console.error("Failed to load auth context", err);
          // Don't strand membership-gated UI if setup threw before the
          // subscription was attached.
          setMembershipsLoaded(true);
        } finally {
          setLoading(false);
        }
      }
    );

    function subscribeMemberships(uid: string) {
      return onSnapshot(
        collection(getFirebaseDb(), `userMemberships/${uid}/subAccounts`),
        (snap) => {
          const items: UserSubAccountMembership[] = snap.docs.map((d) => {
            const data = d.data() as Partial<UserSubAccountMembership>;
            return {
              subAccountId: data.subAccountId ?? d.id,
              agencyId: data.agencyId ?? "",
              role: (data.role ?? "collaborator") as "admin" | "collaborator",
              name: data.name ?? "",
              accountNumber: data.accountNumber,
              addedAt: data.addedAt instanceof Date ? data.addedAt : new Date(),
            };
          });
          setMemberships(items);
          setMembershipsLoaded(true);
        },
        () => {
          setMemberships([]);
          setMembershipsLoaded(true);
        }
      );
    }

    return () => {
      cleanupMembership();
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        adminUid,
        role,
        status,
        agencyId,
        agencyRole,
        memberships,
        membershipsLoaded,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

"use client";

import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
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
  undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<MemberStatus | null>(null);
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [agencyRole, setAgencyRole] = useState<AgencyRole | null>(null);
  const [memberships, setMemberships] = useState<UserSubAccountMembership[]>([]);
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
          // Refresh the ID token FIRST so newly-set custom claims (status,
          // agencyId, agencyRole) are present on the token before any
          // Firestore read fires. Without this, rules see a stale token
          // missing the `status: "active"` claim and deny the reads with
          // "Missing or insufficient permissions".
          const tokenResult = await firebaseUser
            .getIdTokenResult(true)
            .catch(() => null);
          const claims = tokenResult?.claims ?? {};

          const db = getFirebaseDb();
          const [cfgSnap, userSnap] = await Promise.all([
            getDoc(doc(db, "appConfig", "main")),
            getDoc(doc(db, "users", firebaseUser.uid)),
          ]);

          const cfg = cfgSnap.exists()
            ? (cfgSnap.data() as AppConfig)
            : null;
          const userDoc = userSnap.exists()
            ? (userSnap.data() as UserDoc)
            : null;

          if (!userDoc || userDoc.status !== "active") {
            // Removed/orphan user — sign them out hard.
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
          setAgencyId(
            (claims.agencyId as string | undefined) ??
              userDoc.primaryAgencyId ??
              null,
          );
          setAgencyRole(
            (claims.agencyRole as AgencyRole | null | undefined) ?? null,
          );

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

          // Subscribe to the user's sub-account memberships so the switcher
          // updates live when an admin adds/removes them somewhere.
          membershipUnsub = onSnapshot(
            collection(db, `userMemberships/${firebaseUser.uid}/subAccounts`),
            (snap) => {
              const items: UserSubAccountMembership[] = snap.docs.map((d) => {
                const data = d.data() as Partial<UserSubAccountMembership>;
                return {
                  subAccountId: data.subAccountId ?? d.id,
                  agencyId: data.agencyId ?? "",
                  role: (data.role ?? "collaborator") as
                    | "admin"
                    | "collaborator",
                  name: data.name ?? "",
                  accountNumber: data.accountNumber,
                  addedAt:
                    data.addedAt instanceof Date
                      ? data.addedAt
                      : new Date(),
                };
              });
              setMemberships(items);
              setMembershipsLoaded(true);
            },
            () => {
              setMemberships([]);
              setMembershipsLoaded(true);
            },
          );
        } catch (err) {
          console.error("Failed to load auth context", err);
          // Don't strand membership-gated UI if setup threw before the
          // subscription was attached.
          setMembershipsLoaded(true);
        } finally {
          setLoading(false);
        }
      },
    );

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

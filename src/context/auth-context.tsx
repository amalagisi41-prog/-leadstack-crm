"use client";

import {
  createContext,
  useCallback,
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
  /**
   * Set when the automatic repair-workspace attempt (see below) ran and
   * didn't produce an agencyId — either the request itself failed, or the
   * endpoint responded with an error. Null means either repair hasn't run,
   * isn't needed, or already succeeded. Surfaced so the "workspace couldn't
   * be set up" empty state can show the real reason instead of a black box.
   */
  repairError: string | null;
  /**
   * Re-runs the repair-workspace call on demand (e.g. a "Retry setup"
   * button) without requiring a full page reload / re-auth.
   */
  retryWorkspaceRepair: () => Promise<void>;
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
  const [repairError, setRepairError] = useState<string | null>(null);

  // Self-heal: an active, signed-in user with no home agency shouldn't
  // happen on the happy path (every signup route — email/password and
  // OAuth — provisions one before returning), but a partial failure
  // upstream can leave an account stuck staring at an empty agency page
  // despite being fully authenticated. Returns the repaired agencyId, or
  // null (and sets `repairError` to the real reason) if it didn't work.
  const runWorkspaceRepair = useCallback(
    async (): Promise<string | null> => {
      try {
        const repairRes = await fetch("/api/auth/repair-workspace", {
          method: "POST",
          credentials: "include",
        });
        if (repairRes.ok) {
          const repaired = (await repairRes.json().catch(() => ({}))) as {
            agencyId?: string;
          };
          if (repaired.agencyId) {
            // Force a full reload instead of patching React state in
            // place. The sub-account membership listener (set up once per
            // real auth-state change, using whatever ID token was active
            // at that moment) doesn't get recreated just because this
            // function refreshes the token and updates agencyId/agencyRole
            // — if that listener was established before this account had
            // its claims/tenancy fully resolved, its permission-denied is
            // terminal and won't self-heal on its own. A full reload
            // guarantees a brand-new auth cycle (and a brand-new listener)
            // against the now-correct server state.
            //
            // Guard against a reload loop: if repair keeps "succeeding"
            // (the server genuinely has an agencyId) but something else
            // stops the client from resolving it fresh-load after
            // fresh-load, reloading forever looks exactly like a frozen
            // screen. Only reload once per browser session.
            const loopGuardKey = "agentstack:workspace-repair-reloaded";
            const alreadyReloaded =
              typeof window !== "undefined" &&
              window.sessionStorage.getItem(loopGuardKey) === "1";
            if (!alreadyReloaded && typeof window !== "undefined") {
              window.sessionStorage.setItem(loopGuardKey, "1");
              window.location.reload();
              return repaired.agencyId;
            }
            if (alreadyReloaded) {
              setRepairError(
                "Your account has a valid workspace, but this browser session can't load it. Try signing out and back in, or contact support.",
              );
              return null;
            }
            return repaired.agencyId;
          }
          const reason = "Setup response was missing an agency id.";
          console.warn("[auth] repair-workspace succeeded but returned no agencyId");
          setRepairError(reason);
          return null;
        }
        const body = (await repairRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        const reason = body?.error || `Setup failed (HTTP ${repairRes.status}).`;
        console.warn("[auth] repair-workspace failed", reason);
        setRepairError(reason);
        return null;
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : "Setup request failed.";
        console.warn("[auth] repair-workspace failed", err);
        setRepairError(reason);
        return null;
      }
    },
    [],
  );

  const retryWorkspaceRepair = useCallback(async () => {
    const firebaseUser = getFirebaseAuth().currentUser;
    if (!firebaseUser) {
      // Firebase's client SDK has no synchronous current user even though
      // our own React state still shows one — surface this instead of
      // silently no-op'ing, which previously left the Retry button looking
      // like it did nothing at all.
      setRepairError(
        "Your sign-in session isn't available right now. Please reload the page.",
      );
      return;
    }
    setRepairError(null);
    await runWorkspaceRepair();
  }, [runWorkspaceRepair]);

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
          // appConfig/main's rule requires the `status` custom claim
          // already be on the token (isActive()) — even with the
          // force-refresh above, Firestore's own re-auth of its active
          // connection can lag a tick behind the Auth SDK's token cache
          // update, so this read can still be transiently denied right
          // after sign-in/claims changes. It's only used for the legacy
          // `adminUid` field below, so let it fail independently instead
          // of using Promise.all — otherwise one denied, non-critical read
          // aborts the users/{uid} read too (which only needs basic auth,
          // no claims, and drives the actual agencyId resolution below),
          // permanently stranding the account on "couldn't be set up"
          // with no visible error and no repair attempt ever firing.
          const [cfgSnap, userSnap] = await Promise.all([
            getDoc(doc(db, "appConfig", "main")).catch(() => null),
            getDoc(doc(db, "users", firebaseUser.uid)),
          ]);

          const cfg = cfgSnap?.exists()
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
          let resolvedAgencyId =
            (claims.agencyId as string | undefined) ??
            userDoc.primaryAgencyId ??
            null;
          setAgencyId(resolvedAgencyId);
          setAgencyRole(
            (claims.agencyRole as AgencyRole | null | undefined) ?? null,
          );

          if (!resolvedAgencyId) {
            resolvedAgencyId = await runWorkspaceRepair();
          } else {
            setRepairError(null);
            // Resolved cleanly without needing repair — clear the reload
            // loop guard so a genuinely new problem later (a different
            // account signing into this same tab, say) isn't blocked by a
            // stale flag from an earlier session.
            if (typeof window !== "undefined") {
              window.sessionStorage.removeItem(
                "agentstack:workspace-repair-reloaded",
              );
            }
          }

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
  }, [runWorkspaceRepair]);

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
        repairError,
        retryWorkspaceRepair,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

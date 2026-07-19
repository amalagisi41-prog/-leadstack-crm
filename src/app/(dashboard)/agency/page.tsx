"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
  Building2,
  Plus,
  ArrowRight,
  AlertCircle,
  Users,
  FlaskConical,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusTab } from "@/components/agency/status-tab";
import { SubAccountManageDialog } from "@/components/agency/sub-account-manage-dialog";
import { LANDING_VARIANT } from "@/config/landing";
import type { SubAccountDoc } from "@/types";
import { useRouter } from "next/navigation";

function ErrorBanner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  if (error !== "no-access") return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
      <div>
        <p className="font-medium">No access to that sub-account</p>
        <p className="text-muted-foreground">
          Pick one below or ask the agency owner for an invite.
        </p>
      </div>
    </div>
  );
}

function AgencyHomeContent() {
  const {
    user,
    loading,
    agencyId,
    agencyRole,
    memberships,
    membershipsLoaded,
  } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [repairingSession, setRepairingSession] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);
  const attemptedRepair = useRef(false);
  const isOwner = agencyRole === "owner";

  const visible = memberships.filter((m) =>
    m.name.toLowerCase().includes(filter.trim().toLowerCase())
  );

  // Full sub-account docs (owner only) — needed so the Manage dialog has the
  // current feature-gate state. The cards themselves render from memberships.
  const [subs, setSubs] = useState<SubAccountDoc[]>([]);
  const [managingId, setManagingId] = useState<string | null>(null);
  const managing = subs.find((s) => s.id === managingId) ?? null;

  useEffect(() => {
    if (!isOwner || !agencyId) {
      setSubs([]);
      return;
    }
    const q = query(
      collection(getFirebaseDb(), "subAccounts"),
      where("agencyId", "==", agencyId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => setSubs(snap.docs.map((d) => d.data() as SubAccountDoc)),
      (err) => console.error("[agency] sub-account listen failed", err)
    );
    return () => unsub();
  }, [isOwner, agencyId]);

  const agency = useAgency();
  useEffect(() => {
    document.title = `Agency · ${agency.name}`;
  }, [agency.name]);

  useEffect(() => {
    if (loading || !user || !membershipsLoaded) return;
    if (agencyRole === "owner") return;
    const firstMembership = memberships[0];
    if (!firstMembership) return;
    router.replace(`/sa/${firstMembership.subAccountId}/dashboard`);
  }, [agencyRole, loading, memberships, membershipsLoaded, router, user]);

  // Solo Beta: an owner whose agency hasn't graduated to multi-account mode
  // (the default — see AgencyDoc.multiAccountModeEnabled) has no use for the
  // Agency home even if they land here directly. Send them straight into
  // their one workspace. An owner with zero sub-accounts yet stays here to
  // use the create-one flow below.
  useEffect(() => {
    if (loading || !user || !membershipsLoaded || !isOwner) return;
    if (agency.loading) return;
    if (agency.multiAccountModeEnabled) return;
    const firstMembership = memberships[0];
    if (!firstMembership) return;
    router.replace(`/sa/${firstMembership.subAccountId}/dashboard`);
  }, [
    loading,
    user,
    membershipsLoaded,
    isOwner,
    agency.loading,
    agency.multiAccountModeEnabled,
    memberships,
    router,
  ]);

  useEffect(() => {
    if (
      loading ||
      !user ||
      !membershipsLoaded ||
      agencyId ||
      attemptedRepair.current
    )
      return;
    if (agencyRole !== "owner" && memberships.length > 0) return;
    attemptedRepair.current = true;
    setRepairingSession(true);

    void fetch("/api/auth/refresh-claims", {
      method: "POST",
      headers: { "x-user-uid": user.uid },
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Could not restore workspace access.");
        await user.getIdToken(true);
        window.location.reload();
      })
      .catch(() => {
        setRepairFailed(true);
        setRepairingSession(false);
      });
  }, [agencyId, agencyRole, loading, memberships, membershipsLoaded, user]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-muted h-8 w-48 animate-pulse rounded" />
        <div className="bg-muted/50 h-32 animate-pulse rounded-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-card rounded-2xl border p-8 text-center">
        <p className="text-muted-foreground text-sm">
          Sign in to view your agency.
        </p>
      </div>
    );
  }

  if (!agencyId) {
    return (
      <div className="bg-card rounded-2xl border p-8 text-center">
        <p className="text-sm font-medium">
          {repairingSession
            ? "Finishing your workspace setup…"
            : "Your sign-in worked, but workspace access is incomplete."}
        </p>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm">
          {repairFailed
            ? "Sign out and sign in again to refresh your AgentStack workspace."
            : "We’re securely refreshing your agency access. This page will reload automatically."}
        </p>
        {repairFailed && (
          <Button
            className="mt-4"
            onClick={() => window.location.assign("/login")}
          >
            Return to sign in
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agency</h1>
          <p className="text-muted-foreground text-sm">
            Switch into a sub-account or stand up a new one.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner && LANDING_VARIANT === "agentstack" && (
            <>
              <Button
                variant="outline"
                render={<Link href="/agency/landing" />}
              >
                <FlaskConical className="mr-1 h-4 w-4" />
                A/B/C test
              </Button>
              <Button
                variant="outline"
                render={<Link href="/agency/affiliates" />}
              >
                <Users className="mr-1 h-4 w-4" />
                Affiliates
              </Button>
            </>
          )}
          {isOwner && (
            <Button render={<Link href="/agency/sub-accounts/new" />}>
              <Plus className="mr-1 h-4 w-4" />
              New sub-account
            </Button>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <ErrorBanner />
      </Suspense>

      <Tabs defaultValue="sub-accounts">
        <TabsList>
          <TabsTrigger value="sub-accounts">Sub-accounts</TabsTrigger>
          {isOwner && <TabsTrigger value="status">Status</TabsTrigger>}
        </TabsList>

        <TabsContent value="sub-accounts" className="mt-4">
          <section className="bg-card rounded-2xl border p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Building2 className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Your sub-accounts</h2>
                  <p className="text-muted-foreground text-xs">
                    {memberships.length} total
                  </p>
                </div>
              </div>
              {memberships.length > 4 && (
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter…"
                  className="h-8 w-48"
                />
              )}
            </div>

            {memberships.length === 0 ? (
              <div className="bg-background text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                You don&apos;t have access to any sub-accounts yet.
                {isOwner && (
                  <>
                    {" "}
                    <Link
                      href="/agency/sub-accounts/new"
                      className="text-primary underline"
                    >
                      Create one
                    </Link>{" "}
                    to get started.
                  </>
                )}
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((m) => (
                  <li key={m.subAccountId} className="relative">
                    <Link
                      href={`/sa/${m.subAccountId}/dashboard`}
                      className="group bg-background hover:border-primary/40 hover:bg-muted/30 flex h-full flex-col justify-between gap-3 rounded-xl border p-4 transition-colors"
                    >
                      <div>
                        <div className="flex items-baseline gap-2 pr-16">
                          <p className="text-sm font-medium">
                            {m.name || "Untitled"}
                          </p>
                          {m.accountNumber !== undefined && (
                            <span className="text-muted-foreground font-mono text-[10px]">
                              #{m.accountNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                          {m.role}
                        </p>
                      </div>
                      <span className="text-muted-foreground group-hover:text-foreground flex items-center gap-1 text-xs">
                        Open <ArrowRight className="h-3 w-3" />
                      </span>
                    </Link>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => setManagingId(m.subAccountId)}
                        className="bg-background text-muted-foreground hover:bg-muted hover:text-foreground absolute top-3 right-3 z-10 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors"
                      >
                        Manage
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        {isOwner && (
          <TabsContent value="status" className="mt-4">
            <StatusTab />
          </TabsContent>
        )}
      </Tabs>

      <SubAccountManageDialog
        subAccount={managing}
        open={!!managingId}
        onOpenChange={(open) => {
          if (!open) setManagingId(null);
        }}
      />
    </div>
  );
}

export default function AgencyHomePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <AgencyHomeContent />
    </div>
  );
}

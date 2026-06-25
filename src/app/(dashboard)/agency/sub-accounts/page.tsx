"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Building2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { SubAccountManageDialog } from "@/components/agency/sub-account-manage-dialog";
import type { SubAccountDoc } from "@/types";

export default function SubAccountsListPage() {
  const { agencyId, agencyRole, loading: authLoading } = useAuth();
  const [subs, setSubs] = useState<SubAccountDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [managingId, setManagingId] = useState<string | null>(null);
  const isAgencyOwner = agencyRole === "owner";
  const managing = subs.find((s) => s.id === managingId) ?? null;

  useEffect(() => {
    if (!agencyId) {
      setSubs([]);
      setLoading(false);
      return;
    }
    // Filter by agencyId only; sort client-side. Adding orderBy here would
    // require a composite (agencyId, createdAt) index, which is friction we
    // don't need for what's typically a small list per agency.
    const q = query(
      collection(getFirebaseDb(), "subAccounts"),
      where("agencyId", "==", agencyId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as SubAccountDoc);
        list.sort(
          (a, b) =>
            (a.accountNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.accountNumber ?? Number.MAX_SAFE_INTEGER),
        );
        setSubs(list);
        setLoading(false);
      },
      (err) => {
        console.error("[agency/sub-accounts] listen failed", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [agencyId]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sub-accounts</h1>
          <p className="text-sm text-muted-foreground">
            One workspace per client. Each sub-account has its own contacts,
            pipeline, and team.
          </p>
        </div>
        {agencyRole === "owner" && (
          <Button render={<Link href="/agency/sub-accounts/new" />}>
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        )}
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-24 px-4 py-2.5 text-left font-medium">#</th>
              <th className="px-4 py-2.5 text-left font-medium">Name</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Timezone</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {subs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  <Building2 className="mx-auto mb-2 h-6 w-6" />
                  No sub-accounts yet.
                </td>
              </tr>
            ) : (
              subs.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {s.accountNumber !== undefined ? `#${s.accountNumber}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        s.status === "active"
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                          : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                      }
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.timezone}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-4">
                      {isAgencyOwner && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 rounded-full px-3 text-xs"
                          onClick={() => setManagingId(s.id)}
                        >
                          Manage
                        </Button>
                      )}
                      <Link
                        href={`/sa/${s.id}/dashboard`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Open →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

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

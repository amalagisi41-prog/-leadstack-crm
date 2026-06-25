"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, UserX } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToMembers,
  subscribeToMemberships,
  subscribeToPurchases,
} from "@/lib/firestore/community-roster";
import { Button } from "@/components/ui/button";
import type { GroupMembership, Member, Purchase } from "@/types/community";

export default function CommunityRosterPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { groupId } = use(params);
  const { subAccountId, isAdmin } = useSubAccount();
  const apiBase = `/api/sub-accounts/${subAccountId}/community/${groupId}`;

  const [members, setMembers] = useState<Member[]>([]);
  const [memberships, setMemberships] = useState<GroupMembership[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const u1 = subscribeToMembers(subAccountId, setMembers);
    const u2 = subscribeToMemberships(subAccountId, groupId, setMemberships);
    const u3 = subscribeToPurchases(subAccountId, groupId, setPurchases);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [subAccountId, groupId]);

  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m]));
    return (memberId: string) => {
      const m = map.get(memberId);
      if (!m) return "Member";
      return m.displayName?.trim() || m.email.split("@")[0] || m.email;
    };
  }, [members]);

  const pending = memberships.filter((m) => m.status === "pending");
  const active = memberships
    .filter((m) => m.status === "active")
    .sort((a, b) => b.points - a.points);
  const pendingPurchases = purchases.filter((p) => p.status === "pending");

  async function membershipAction(
    memberId: string,
    action: "approve" | "remove" | "promote" | "demote",
  ) {
    setBusy(memberId);
    try {
      const res = await fetch(`${apiBase}/memberships/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
      const messages: Record<typeof action, string> = {
        approve: "Member approved",
        remove: "Member removed",
        promote: "Promoted to moderator",
        demote: "Moderator role removed",
      };
      toast.success(messages[action]);
    } catch {
      toast.error("Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(purchaseId: string) {
    setBusy(purchaseId);
    try {
      const res = await fetch(`${apiBase}/purchases/${purchaseId}/mark-paid`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      toast.success("Marked paid — access granted");
    } catch {
      toast.error("Couldn't mark paid");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <Link
          href={`/sa/${subAccountId}/community/${groupId}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Group settings
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Members</h1>
      </div>

      {pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Pending join requests ({pending.length})
          </h2>
          {pending.map((m) => (
            <div
              key={m.memberId}
              className="flex items-center justify-between rounded-lg border bg-card p-3"
            >
              <span className="text-sm">{nameOf(m.memberId)}</span>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => membershipAction(m.memberId, "approve")}
                    disabled={busy === m.memberId}
                  >
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => membershipAction(m.memberId, "remove")}
                    disabled={busy === m.memberId}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {pendingPurchases.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">
            Pending payments ({pendingPurchases.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Confirm the payment landed in your PayPal account, then mark it paid
            to grant access.
          </p>
          {pendingPurchases.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border bg-card p-3"
            >
              <div className="text-sm">
                <span className="font-medium">{nameOf(p.memberId)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {p.scope === "group" ? "Group access" : "Course"} ·{" "}
                  {(p.amountCents / 100).toFixed(2)} {p.currency}
                </span>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  onClick={() => markPaid(p.id)}
                  disabled={busy === p.id}
                >
                  {busy === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Mark paid"
                  )}
                </Button>
              )}
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Members ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        ) : (
          <div className="divide-y rounded-lg border bg-card">
            {active.map((m) => (
              <div
                key={m.memberId}
                className="flex items-center justify-between p-3"
              >
                <div className="text-sm">
                  <span className="font-medium">{nameOf(m.memberId)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · Level {m.level} · {m.points} pts
                    {m.role === "moderator" ? " · Mod" : ""}
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        membershipAction(
                          m.memberId,
                          m.role === "moderator" ? "demote" : "promote",
                        )
                      }
                      disabled={busy === m.memberId}
                    >
                      {m.role === "moderator" ? "Remove mod" : "Make mod"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => membershipAction(m.memberId, "remove")}
                      disabled={busy === m.memberId}
                      title="Remove member"
                    >
                      <UserX className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

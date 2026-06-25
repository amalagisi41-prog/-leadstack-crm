"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Mail, Shield, UserPlus, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ManageMembersDialog } from "@/components/settings/manage-members-dialog";
import { TerritoryMultiSelect } from "@/components/settings/territory-multi-select";
import type { InviteDocV2, SubAccountMemberDoc, TerritoryDoc } from "@/types";

/** Most-recently-added members shown inline before opening the modal. */
const PREVIEW_COUNT = 3;

/** Firestore Timestamp | Date | undefined → epoch ms (0 when absent). */
function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  if (
    typeof v === "object" &&
    v !== null &&
    "toMillis" in v &&
    typeof (v as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "object" && v !== null && "seconds" in v) {
    return (v as { seconds: number }).seconds * 1000;
  }
  return 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SubAccountMembersSection() {
  const { user } = useAuth();
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;

  const [members, setMembers] = useState<SubAccountMemberDoc[]>([]);
  const [invites, setInvites] = useState<(InviteDocV2 & { id: string })[]>([]);
  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "collaborator">(
    "collaborator",
  );
  const [inviteTerritoryIds, setInviteTerritoryIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    if (!subAccountId || !isAdmin) return;
    const db = getFirebaseDb();
    const unsubMembers = onSnapshot(
      collection(db, `subAccounts/${subAccountId}/subAccountMembers`),
      (snap) => {
        setMembers(
          snap.docs
            .map((d) => d.data() as SubAccountMemberDoc)
            .filter((m) => m.status === "active"),
        );
      },
    );
    const unsubInvites = onSnapshot(
      query(
        collection(db, "invites"),
        where("subAccountId", "==", subAccountId),
        where("acceptedByUid", "==", null),
        where("revokedAt", "==", null),
      ),
      (snap) => {
        setInvites(
          snap.docs.map((d) => {
            const data = d.data() as InviteDocV2;
            return { ...data, id: d.id };
          }),
        );
      },
      () => setInvites([]),
    );
    return () => {
      unsubMembers();
      unsubInvites();
    };
  }, [subAccountId, isAdmin]);

  // Subscribe to territories only when scoping is on. Off-state keeps
  // the Members section identical to the pre-territory experience —
  // no extra listener, no extra column.
  useEffect(() => {
    if (!subAccountId || !isAdmin || !scopingOn) {
      setTerritories([]);
      return;
    }
    const unsub = subscribeToTerritories(
      subAccountId,
      (list) => setTerritories(list),
    );
    return () => unsub();
  }, [subAccountId, isAdmin, scopingOn]);

  if (!isAdmin) return null;

  // Inline preview: the most-recently-added members. Full roster lives in
  // the Manage members modal.
  const recentMembers = [...members]
    .sort((a, b) => toMillis(b.addedAt) - toMillis(a.addedAt))
    .slice(0, PREVIEW_COUNT);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      toast.error("Enter a valid email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role: inviteRole,
          // Territories only apply to scoped collaborators; admins see all.
          assignedTerritoryIds:
            scopingOn && inviteRole === "collaborator"
              ? inviteTerritoryIds
              : [],
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        mailed?: boolean;
        inviteUrl?: string;
      };
      if (!res.ok) throw new Error(payload.error ?? "Could not invite");

      if (payload.mailed) {
        toast.success(`Invite emailed to ${email}`);
      } else if (payload.inviteUrl) {
        // Resend isn't configured (or send failed) — copy the link so the
        // admin can share it manually without leaving the page.
        try {
          await navigator.clipboard.writeText(payload.inviteUrl);
          toast.success(
            `Invite created — link copied (set RESEND_API_KEY to email automatically)`,
          );
        } catch {
          toast.success(
            `Invite created — copy the link from "Pending invites" below`,
          );
        }
      } else {
        toast.success(`Invited ${email}`);
      }
      setInviteEmail("");
      setInviteTerritoryIds([]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not invite.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInviteLink(email: string) {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/signup?email=${encodeURIComponent(email)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy — your browser blocked clipboard access");
    }
  }

  async function revokeInvite(inviteId: string, email: string) {
    if (!confirm(`Cancel the invite for ${email}?`)) return;
    setBusyInviteId(inviteId);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/invite/${inviteId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Could not cancel invite");
      }
      toast.success(`Invite for ${email} cancelled`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not cancel invite.",
      );
    } finally {
      setBusyInviteId(null);
    }
  }

  async function handleRoleChange(
    uid: string,
    role: "admin" | "collaborator",
  ) {
    setBusyUid(uid);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/members/${uid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Could not change role");
      }
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusyUid(null);
    }
  }

  async function handleTerritoryChange(uid: string, next: string[]) {
    setBusyUid(uid);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/members/${uid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignedTerritoryIds: next }),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Could not update territories");
      }
      toast.success("Territory assignment updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusyUid(null);
    }
  }

  async function handleRemove(uid: string, displayName: string) {
    if (!confirm(`Remove ${displayName} from this sub-account?`)) return;
    setBusyUid(uid);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/members/${uid}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? "Could not remove");
      }
      toast.success(`Removed ${displayName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Users className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Members</h2>
          <p className="text-xs text-muted-foreground">
            Invite teammates to this sub-account.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleInvite}
        className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border bg-background p-3"
      >
        <div className="min-w-[200px] flex-1 space-y-1.5">
          <Label htmlFor="invite-email" className="text-xs">
            Invite by email
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role" className="text-xs">
            Role
          </Label>
          <select
            id="invite-role"
            value={inviteRole}
            onChange={(e) => {
              const next = e.target.value as "admin" | "collaborator";
              setInviteRole(next);
              // Admins see every territory — clear any pre-pick so we don't
              // send stale ids the server would ignore anyway.
              if (next === "admin") setInviteTerritoryIds([]);
            }}
            className="h-9 w-52 rounded-md border border-input bg-background py-0 pl-3 pr-8 text-sm"
          >
            <option value="collaborator">Workspace Collaborator</option>
            <option value="admin">Workspace Admin</option>
          </select>
        </div>
        {scopingOn && inviteRole === "collaborator" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Territories</Label>
            <TerritoryMultiSelect
              value={inviteTerritoryIds}
              territories={territories}
              onChange={setInviteTerritoryIds}
              ariaLabel="Assign territories to this invite"
            />
          </div>
        )}
        <Button type="submit" disabled={submitting}>
          <UserPlus className="mr-1 h-4 w-4" />
          {submitting ? "Inviting…" : "Send invite"}
        </Button>
      </form>
      {scopingOn && inviteRole === "collaborator" && (
        <p className="-mt-3 mb-5 text-[11px] text-muted-foreground">
          Leave territories empty to default this collaborator to{" "}
          <strong className="text-foreground">Global</strong> (sees everything
          until you narrow them down). You can change this later in Manage
          members.
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Active members
          </p>
          <span className="text-[11px] text-muted-foreground">
            {members.length === 0
              ? "None yet"
              : `Showing ${Math.min(PREVIEW_COUNT, members.length)} of ${members.length}`}
          </span>
        </div>

        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
            No active members.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recentMembers.map((m) => {
              const isMe = m.uid === user?.uid;
              return (
                <li
                  key={m.uid}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {m.displayName || m.email}
                      {isMe && (
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                    {m.role}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setManageOpen(true)}
          >
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Manage members
          </Button>
          {invites.length > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {invites.length} pending invite{invites.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <p className="pt-1 text-[11px] text-muted-foreground">
          <Shield className="mr-1 inline h-3 w-3" />
          Both roles are scoped to this workspace only — they can&apos;t
          see or touch other sub-accounts.{" "}
          <strong className="text-foreground">Workspace Admins</strong>{" "}
          can invite, change roles, and remove members.{" "}
          <strong className="text-foreground">Workspace Collaborators</strong>{" "}
          can read and edit data.
        </p>
      </div>

      <ManageMembersDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        members={members}
        invites={invites}
        territories={territories}
        scopingOn={scopingOn}
        currentUid={user?.uid}
        busyUid={busyUid}
        busyInviteId={busyInviteId}
        onRoleChange={handleRoleChange}
        onTerritoryChange={handleTerritoryChange}
        onRemove={handleRemove}
        onCopyInviteLink={copyInviteLink}
        onRevokeInvite={revokeInvite}
      />
    </section>
  );
}

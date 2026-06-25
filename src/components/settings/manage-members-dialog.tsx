"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Inbox, Plus, Search, Trash2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TerritoryMultiSelect } from "@/components/settings/territory-multi-select";
import type { InviteDocV2, SubAccountMemberDoc, TerritoryDoc } from "@/types";

type PendingInvite = InviteDocV2 & { id: string };

interface ManageMembersDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  members: SubAccountMemberDoc[];
  invites: PendingInvite[];
  territories: TerritoryDoc[];
  /** Whether territory scoping is on — gates the per-member territory column. */
  scopingOn: boolean;
  /** Current user's uid — "you" rows can't change their own role / be removed. */
  currentUid: string | undefined;
  busyUid: string | null;
  busyInviteId: string | null;
  onRoleChange: (uid: string, role: "admin" | "collaborator") => void;
  onTerritoryChange: (uid: string, next: string[]) => void;
  onRemove: (uid: string, displayName: string) => void;
  onCopyInviteLink: (email: string) => void;
  onRevokeInvite: (inviteId: string, email: string) => void;
}

/**
 * Full member-management surface for a sub-account. The settings section
 * keeps a 3-most-recent preview inline; everything beyond a glance —
 * searching the full roster, changing roles, assigning territories,
 * removing members, and managing pending invites — happens here.
 *
 * Built for scale: the medical-company workflow onboards ~150 reps into a
 * single sub-account, so a flat inline list is unusable. The member +
 * invite lists are already loaded via onSnapshot by the parent, so search
 * is a cheap client-side filter (no pagination needed at this size).
 */
export function ManageMembersDialog({
  open,
  onOpenChange,
  members,
  invites,
  territories,
  scopingOn,
  currentUid,
  busyUid,
  busyInviteId,
  onRoleChange,
  onTerritoryChange,
  onRemove,
  onCopyInviteLink,
  onRevokeInvite,
}: ManageMembersDialogProps) {
  const [tab, setTab] = useState<string>("members");
  const [memberQuery, setMemberQuery] = useState("");
  const [inviteQuery, setInviteQuery] = useState("");

  // Reset search + land on Members each time the modal opens.
  useEffect(() => {
    if (open) {
      setTab("members");
      setMemberQuery("");
      setInviteQuery("");
    }
  }, [open]);

  const filteredMembers = useMemo(() => {
    const sorted = [...members].sort((a, b) =>
      (a.displayName || a.email).localeCompare(b.displayName || b.email, undefined, {
        sensitivity: "base",
      }),
    );
    const term = memberQuery.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter(
      (m) =>
        (m.displayName ?? "").toLowerCase().includes(term) ||
        (m.email ?? "").toLowerCase().includes(term),
    );
  }, [members, memberQuery]);

  const filteredInvites = useMemo(() => {
    const sorted = [...invites].sort((a, b) => a.email.localeCompare(b.email));
    const term = inviteQuery.trim().toLowerCase();
    if (!term) return sorted;
    return sorted.filter((inv) => inv.email.toLowerCase().includes(term));
  }, [invites, inviteQuery]);

  const territoryNameById = useMemo(
    () => new Map(territories.map((t) => [t.id, t.name])),
    [territories],
  );

  // What territories a pending invite will apply on accept. Empty → Global
  // (the signup default), matching the invite form's "leave blank" hint.
  function pendingTerritoryLabel(ids: string[] | undefined): string {
    if (!ids || ids.length === 0) return "Global";
    return ids.map((id) => territoryNameById.get(id) ?? id).join(", ");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage members</DialogTitle>
          <DialogDescription>
            Search the roster, change roles
            {scopingOn ? ", assign territories" : ""}, and remove members or
            cancel pending invites.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as string)}>
          <TabsList>
            <TabsTrigger value="members">
              Members ({members.length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending ({invites.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Members ─────────────────────────────────────────── */}
          <TabsContent value="members" className="mt-3 space-y-3">
            <SearchInput
              value={memberQuery}
              onChange={setMemberQuery}
              placeholder="Search members by name or email…"
            />
            {filteredMembers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-5 w-5 text-muted-foreground" />}
                text={
                  members.length === 0
                    ? "No active members yet."
                    : `No members match “${memberQuery.trim()}”.`
                }
              />
            ) : (
              <ul className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-0.5">
                {filteredMembers.map((m) => {
                  const isMe = m.uid === currentUid;
                  return (
                    <li
                      key={m.uid}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
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
                      <div className="flex shrink-0 items-center gap-2">
                        <select
                          value={m.role}
                          onChange={(e) =>
                            onRoleChange(
                              m.uid,
                              e.target.value as "admin" | "collaborator",
                            )
                          }
                          disabled={isMe || busyUid === m.uid}
                          className="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
                          aria-label="Change role"
                        >
                          <option value="collaborator">Collaborator</option>
                          <option value="admin">Admin</option>
                        </select>
                        {scopingOn && (
                          <TerritoryMultiSelect
                            value={m.assignedTerritoryIds ?? []}
                            territories={territories}
                            disabled={busyUid === m.uid}
                            adminLabel={m.role === "admin"}
                            onChange={(next) => onTerritoryChange(m.uid, next)}
                            ariaLabel="Assign territories"
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isMe || busyUid === m.uid}
                          onClick={() =>
                            onRemove(m.uid, m.displayName || m.email)
                          }
                          className="text-destructive hover:text-destructive"
                          aria-label="Remove member"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          {/* ── Pending invites ─────────────────────────────────── */}
          <TabsContent value="pending" className="mt-3 space-y-3">
            <SearchInput
              value={inviteQuery}
              onChange={setInviteQuery}
              placeholder="Search pending invites by email…"
            />
            {filteredInvites.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-5 w-5 text-muted-foreground" />}
                text={
                  invites.length === 0
                    ? "No pending invites."
                    : `No invites match “${inviteQuery.trim()}”.`
                }
              />
            ) : (
              <ul className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-0.5">
                {filteredInvites.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate">{inv.email}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {scopingOn && inv.subAccountRole === "collaborator" && (
                        <span
                          className="hidden max-w-[160px] truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline"
                          title={pendingTerritoryLabel(inv.assignedTerritoryIds)}
                        >
                          {pendingTerritoryLabel(inv.assignedTerritoryIds)}
                        </span>
                      )}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {inv.subAccountRole}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onCopyInviteLink(inv.email)}
                        aria-label="Copy invite link"
                        className="h-7 px-2 text-[11px]"
                        disabled={busyInviteId === inv.id}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copy link
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRevokeInvite(inv.id, inv.email)}
                        aria-label="Cancel invite"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        disabled={busyInviteId === inv.id}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}

function EmptyState({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
      {icon}
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

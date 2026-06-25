"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  HelpCircle,
  Loader2,
  MapPinned,
  Plus,
  Trash2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TerritoryHelpDialog } from "@/components/settings/territory-help-dialog";
import { GLOBAL_TERRITORY_ID, type TerritoryDoc } from "@/types";

/**
 * Territory Scoping settings section.
 *
 * Shape mirrors `SubAccountSmsSection`: a toggle header that's visible
 * to every sub-account admin, and a collapsed-by-default body that
 * appears only when the toggle is on (so unrelated sub-accounts see
 * nothing but the toggle).
 *
 * When the toggle is OFF (the default), nothing changes about how the
 * sub-account behaves — no chips/columns/filters/pickers render
 * anywhere else. The toggle is the single source of truth.
 */
export function SubAccountTerritoriesSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;

  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  // New-territory form state
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Rename-in-place state (one territory at a time)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

  useEffect(() => {
    if (!subAccountId || !isAdmin) {
      setTerritories([]);
      setLoaded(true);
      return;
    }
    const unsub = subscribeToTerritories(
      subAccountId,
      (list) => {
        setTerritories(list);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return () => unsub();
  }, [subAccountId, isAdmin]);

  if (!isAdmin) return null;

  const active = territories.filter((t) => t.status === "active");
  const archived = territories.filter((t) => t.status === "archived");

  async function handleToggle(next: boolean) {
    setToggling(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/territory-scoping`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not update setting.");
      }
      toast.success(
        next
          ? "Territory scoping enabled. Collaborators now only see their assigned territories."
          : "Territory scoping disabled. Collaborators see everything again.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setToggling(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 1) {
      toast.error("Enter a territory name.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/territories`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            code: newCode.trim() || null,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not create territory.");
      }
      toast.success(`Added "${name}"`);
      setNewName("");
      setNewCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create.");
    } finally {
      setCreating(false);
    }
  }

  function startEdit(t: TerritoryDoc) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditCode(t.code ?? "");
  }
  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditCode("");
  }

  async function saveEdit(territoryId: string) {
    const name = editName.trim();
    if (name.length < 1) {
      toast.error("Name can't be empty.");
      return;
    }
    setBusyId(territoryId);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/territories/${territoryId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            code: editCode.trim() || null,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not update.");
      }
      toast.success("Territory updated");
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(
    territoryId: string,
    status: "active" | "archived",
  ) {
    setBusyId(territoryId);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/territories/${territoryId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not update.");
      }
      toast.success(status === "archived" ? "Archived" : "Restored");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(t: TerritoryDoc) {
    if (
      !confirm(
        `Permanently delete "${t.name}"? Only possible if no deals, contacts, or members reference it.`,
      )
    ) {
      return;
    }
    setBusyId(t.id);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/territories/${t.id}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        dealCount?: number;
        contactCount?: number;
        memberCount?: number;
      };
      if (!res.ok || !data.ok) {
        if (
          data.dealCount !== undefined ||
          data.contactCount !== undefined ||
          data.memberCount !== undefined
        ) {
          throw new Error(
            `Still referenced: ${data.dealCount ?? 0} deal(s), ${
              data.contactCount ?? 0
            } contact(s), ${data.memberCount ?? 0} member assignment(s). Archive instead.`,
          );
        }
        throw new Error(data.error ?? "Could not delete.");
      }
      toast.success(`Deleted "${t.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
          <MapPinned className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Territory Scoping</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Restrict collaborators to deals and contacts for the regions
            they cover (US states, custom zones, etc.). Off by default
            — leave off and this sub-account behaves exactly as today.
          </p>
        </div>
        {scopingOn && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHelpOpen(true)}
            className="shrink-0"
          >
            <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
            How it works
          </Button>
        )}
      </header>

      <TerritoryHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      <label className="flex items-start gap-3 rounded-lg border bg-background p-3">
        <input
          type="checkbox"
          checked={scopingOn}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={toggling}
          className="mt-0.5 h-4 w-4 cursor-pointer"
        />
        <div>
          <p className="text-sm font-medium">
            Restrict collaborators to assigned territories
          </p>
          <p className="text-xs text-muted-foreground">
            Workspace admins and the agency owner always see every deal
            and contact regardless of territory. Turn this on to
            configure territories and assign them to each collaborator.
          </p>
        </div>
      </label>

      {/* Warning when scoping is on but the setup isn't complete —
          collaborators see nothing in that state. Surface it loud so
          the admin notices before users complain. */}
      {scopingOn && active.length === 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          Territory scoping is on but no territories exist yet.
          Collaborators currently see no deals or contacts. Add at
          least one territory below and assign it to your team.
        </div>
      )}

      {/* CRUD + list only shown when the toggle is on. Keeps the
          default-off view minimal — just the toggle. Once enabled,
          the admin sees the full configuration surface. */}
      {scopingOn && (
        <div className="mt-5 space-y-5">
          <form
            onSubmit={handleCreate}
            className="flex flex-wrap items-end gap-2 rounded-lg border bg-background p-3"
          >
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <Label htmlFor="new-territory-name" className="text-xs">
                Territory name
              </Label>
              <Input
                id="new-territory-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="California"
                maxLength={60}
              />
            </div>
            <div className="w-28 space-y-1.5">
              <Label htmlFor="new-territory-code" className="text-xs">
                Code (optional)
              </Label>
              <Input
                id="new-territory-code"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="CA"
                maxLength={12}
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1 h-4 w-4" />
              )}
              {creating ? "Adding…" : "Add territory"}
            </Button>
          </form>

          {!loaded ? (
            <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
              Loading territories…
            </div>
          ) : active.length === 0 ? (
            <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">
              No territories yet. Add one above.
            </div>
          ) : (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Active territories
              </p>
              <ul className="space-y-1.5">
                {active.map((t) => (
                  <TerritoryRow
                    key={t.id}
                    territory={t}
                    editing={editingId === t.id}
                    editName={editName}
                    editCode={editCode}
                    setEditName={setEditName}
                    setEditCode={setEditCode}
                    busy={busyId === t.id}
                    onStartEdit={() => startEdit(t)}
                    onCancelEdit={cancelEdit}
                    onSaveEdit={() => saveEdit(t.id)}
                    onArchive={() => setStatus(t.id, "archived")}
                    onRestore={() => setStatus(t.id, "active")}
                    onDelete={() => handleDelete(t)}
                  />
                ))}
              </ul>
            </div>
          )}

          {archived.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Archived
              </p>
              <ul className="space-y-1.5 opacity-70">
                {archived.map((t) => (
                  <TerritoryRow
                    key={t.id}
                    territory={t}
                    editing={editingId === t.id}
                    editName={editName}
                    editCode={editCode}
                    setEditName={setEditName}
                    setEditCode={setEditCode}
                    busy={busyId === t.id}
                    onStartEdit={() => startEdit(t)}
                    onCancelEdit={cancelEdit}
                    onSaveEdit={() => saveEdit(t.id)}
                    onArchive={() => setStatus(t.id, "archived")}
                    onRestore={() => setStatus(t.id, "active")}
                    onDelete={() => handleDelete(t)}
                  />
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Assign territories to each collaborator in the Members
            section below. New deals and contacts a collaborator
            creates auto-tag with their territory when they have
            exactly one assigned.
          </p>
        </div>
      )}
    </section>
  );
}

function TerritoryRow(props: {
  territory: TerritoryDoc;
  editing: boolean;
  editName: string;
  editCode: string;
  setEditName: (v: string) => void;
  setEditCode: (v: string) => void;
  busy: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const {
    territory: t,
    editing,
    editName,
    editCode,
    setEditName,
    setEditCode,
    busy,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onArchive,
    onRestore,
    onDelete,
  } = props;

  const isArchived = t.status === "archived";
  // The reserved Global territory is the default bucket — it can be
  // renamed but not archived/deleted (the API enforces this too).
  const isGlobal = t.id === GLOBAL_TERRITORY_ID;

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
      {editing ? (
        <>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-8 flex-1 min-w-[140px]"
            maxLength={60}
          />
          <Input
            value={editCode}
            onChange={(e) => setEditCode(e.target.value)}
            className="h-8 w-24"
            placeholder="Code"
            maxLength={12}
          />
          <Button
            type="button"
            size="sm"
            onClick={onSaveEdit}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : null}
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancelEdit}
            disabled={busy}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{t.name}</span>
            {t.code && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t.code}
              </span>
            )}
            {isArchived && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Archived
              </span>
            )}
            {isGlobal && (
              <span className="ml-2 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400">
                Default
              </span>
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onStartEdit}
            disabled={busy}
          >
            Rename
          </Button>
          {/* Global is the default bucket — no archive/delete. */}
          {!isGlobal &&
            (isArchived ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onRestore}
                disabled={busy}
                aria-label="Restore"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onArchive}
                disabled={busy}
                aria-label="Archive"
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            ))}
          {!isGlobal && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDelete}
              disabled={busy}
              aria-label="Delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      )}
    </li>
  );
}

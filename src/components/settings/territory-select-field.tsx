"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { Label } from "@/components/ui/label";
import { GLOBAL_TERRITORY_ID, type TerritoryDoc } from "@/types";

interface TerritorySelectFieldProps {
  /** Controlled value — territory id or null. */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Field label. Default "Territory". */
  label?: string;
  /** Id attribute for the underlying <select>. */
  id?: string;
  /** Disable editing (e.g. when saving). */
  disabled?: boolean;
  /**
   * When the current user is a collaborator with exactly one assigned
   * territory AND the current value is null, auto-default to that
   * single territory. Used by the new-deal dialog + add-contact modal
   * so the most common workflow needs zero clicks.
   */
  autoDefaultFromAssigned?: boolean;
}

/**
 * Single-select picker for assigning a territory to a deal or contact.
 *
 * Renders nothing when the sub-account has territory scoping disabled
 * — the parent form keeps `value` at `null` and the saved doc carries
 * `territoryId: null`. This is the load-bearing UI gate for the
 * "off-by-default" contract: no chrome appears anywhere until the
 * sub-account admin flips the toggle.
 *
 * Subscribes its own territories + caller's membership doc so callers
 * don't have to plumb data through props.
 */
export function TerritorySelectField({
  value,
  onChange,
  label = "Territory",
  id = "territory-field",
  disabled,
  autoDefaultFromAssigned,
}: TerritorySelectFieldProps) {
  const { user } = useAuth();
  const { subAccountId, subAccount, myRole } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;

  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);
  const [myAssignedIds, setMyAssignedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!scopingOn || !subAccountId) {
      setTerritories([]);
      return;
    }
    const unsub = subscribeToTerritories(subAccountId, (list) =>
      setTerritories(list),
    );
    return () => unsub();
  }, [scopingOn, subAccountId]);

  useEffect(() => {
    if (!scopingOn || !subAccountId || !user) {
      setMyAssignedIds([]);
      return;
    }
    const ref = doc(
      getFirebaseDb(),
      "subAccounts",
      subAccountId,
      "subAccountMembers",
      user.uid,
    );
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const ids =
          (snap.data()?.assignedTerritoryIds as string[] | undefined) ?? [];
        setMyAssignedIds(ids);
      },
      () => setMyAssignedIds([]),
    );
    return () => unsub();
  }, [scopingOn, subAccountId, user]);

  // Auto-default: a single-territory collaborator's records go to their
  // territory; everyone else (admins, multi-territory reps, no pick)
  // defaults to Global. Only fires when value is null + the prop opts in.
  useEffect(() => {
    if (!autoDefaultFromAssigned) return;
    if (value !== null) return;
    if (myRole !== "admin" && myAssignedIds.length === 1) {
      onChange(myAssignedIds[0]);
    } else {
      onChange(GLOBAL_TERRITORY_ID);
    }
    // Intentionally not depending on `onChange` so the caller can pass
    // a fresh function on every render without re-firing this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDefaultFromAssigned, value, myRole, myAssignedIds]);

  if (!scopingOn) return null;

  // Global is the top default option; the rest of the active territories
  // follow. Global is excluded from the list to avoid a duplicate.
  const activeTerritories = territories.filter(
    (t) => t.status === "active" && t.id !== GLOBAL_TERRITORY_ID,
  );

  // Show the currently-assigned territory even if it's been archived
  // since the doc was tagged — otherwise the option would vanish from
  // the dropdown and the form would look like it lost the value.
  const currentArchived = territories.find(
    (t) => t.id === value && t.status === "archived",
  );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value ?? GLOBAL_TERRITORY_ID}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
      >
        <option value={GLOBAL_TERRITORY_ID}>Global (all reps)</option>
        {activeTerritories.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.code ? ` (${t.code})` : ""}
          </option>
        ))}
        {currentArchived && (
          <option value={currentArchived.id}>
            {currentArchived.name} (archived)
          </option>
        )}
      </select>
    </div>
  );
}

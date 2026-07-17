import type { Timestamp, FieldValue } from "firebase/firestore";

export interface Task {
  id: string;
  title: string;
  notes: string;
  dueAt: Timestamp | FieldValue | null;
  completed: boolean;
  completedAt: Timestamp | FieldValue | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  /**
   * Who this task is for. Drives the "Mine" vs "Everyone" split on the
   * Tasks page, the sidebar due-today badge, and the dashboard's Today's
   * priorities panel — each person's daily list is their own assigned
   * tasks, not the whole team's. Defaults to `createdByUid` at creation
   * time (see api/tasks/route.ts) but can be reassigned to a teammate.
   * `null` only on tasks created before this field existed — callers
   * should treat `assignedToUid ?? createdByUid` as "who owns this."
   */
  assignedToUid: string | null;
  /**
   * Denormalized territory tag, inherited from the linked contact at
   * creation and kept in sync when the contact is re-tagged. `null` =
   * unscoped / standalone (admin-only triage when scoping is on).
   * Ignored unless the sub-account's `territoryScopingEnabled` is true.
   */
  territoryId?: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export type TaskFormData = {
  title: string;
  notes: string;
  dueAt: Date | null;
  contactId: string | null;
  dealId: string | null;
  eventId: string | null;
  assignedToUid: string | null;
};

export type TaskFilter = "today" | "overdue" | "upcoming" | "done" | "all";

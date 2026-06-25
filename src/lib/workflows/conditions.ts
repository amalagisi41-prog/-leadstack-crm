import "server-only";

import type { Condition, ConditionGroup } from "@/types/workflows";
import type { Contact } from "@/types/contacts";

/**
 * Evaluate a workflow ConditionGroup (an AND list in v1) against a contact.
 * Used for both trigger filters and `if_else` branch nodes. An empty group
 * is always true (no filter).
 */
function getField(contact: Contact, path: string): unknown {
  if (path.startsWith("customFields.")) {
    const key = path.slice("customFields.".length);
    return contact.customFields?.[key] ?? null;
  }
  return (contact as unknown as Record<string, unknown>)[path] ?? null;
}

function evalOne(contact: Contact, c: Condition): boolean {
  const raw = getField(contact, c.field);
  const val = (c.value ?? "").trim();
  switch (c.op) {
    case "is_set":
      return raw !== null && raw !== undefined && raw !== "";
    case "not_set":
      return raw === null || raw === undefined || raw === "";
    case "has_tag":
      return Array.isArray(contact.tags) && contact.tags.includes(val);
    case "in_stage":
      return (contact.pipelineStage ?? "") === val;
    case "source_is":
      return (contact.source ?? "") === val;
    case "equals":
      return String(raw ?? "") === val;
    case "not_equals":
      return String(raw ?? "") !== val;
    case "contains":
      return String(raw ?? "").toLowerCase().includes(val.toLowerCase());
    default:
      return false;
  }
}

export function evalConditionGroup(
  group: ConditionGroup | undefined,
  contact: Contact,
): boolean {
  const all = group?.all ?? [];
  if (all.length === 0) return true;
  return all.every((c) => evalOne(contact, c));
}

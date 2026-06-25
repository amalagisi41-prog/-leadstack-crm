"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency, daysSince } from "@/lib/format";
import { getPriority, type Deal } from "@/types/deals";
import type { Contact } from "@/types/contacts";
import { useSubAccount } from "@/context/sub-account-context";

interface DealCardProps {
  deal: Deal;
  contact: Contact | undefined;
  /** Resolved territory name for this deal. Only rendered when scoping is on. */
  territoryName?: string;
  dragging?: boolean;
  overlay?: boolean;
  listeners?: React.HTMLAttributes<HTMLElement>;
  attributes?: React.HTMLAttributes<HTMLElement>;
  setNodeRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
  onEdit?: () => void;
}

export function DealCard({
  deal,
  contact,
  territoryName,
  dragging,
  overlay,
  listeners,
  attributes,
  setNodeRef,
  style,
  onEdit,
}: DealCardProps) {
  const { saPath, subAccount } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;

  // "Completed" tick, only shown on Won deals. Optimistic local state, synced
  // to the live deal snapshot; persists via the shared deals PATCH route (which
  // also fires the optional Google review request).
  const [completed, setCompleted] = useState(!!deal.completed);
  const [savingCompleted, setSavingCompleted] = useState(false);
  useEffect(() => {
    setCompleted(!!deal.completed);
  }, [deal.completed]);

  async function toggleCompleted(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !completed;
    setCompleted(next);
    setSavingCompleted(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success(next ? "Marked completed" : "Marked not completed");
    } catch {
      setCompleted(!next);
      toast.error("Couldn't update. Try again.");
    } finally {
      setSavingCompleted(false);
    }
  }

  const days = daysSince(deal.stageChangedAt);
  const daysLabel =
    days === 0 ? "today" : days === 1 ? "1d in stage" : `${days}d in stage`;
  const priority = getPriority(deal.priority);

  const initials = (contact?.name || contact?.email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border bg-card p-3 text-sm shadow-sm transition-all",
        "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r-full before:bg-gradient-to-b before:from-indigo-500 before:via-violet-500 before:to-pink-500 before:opacity-0 before:transition-opacity",
        !overlay && "cursor-grab hover:border-primary/40 hover:shadow-md hover:before:opacity-100 active:cursor-grabbing",
        dragging && "opacity-40",
        overlay && "rotate-1 scale-[1.02] cursor-grabbing shadow-lg ring-2 ring-primary/40",
      )}
      {...attributes}
      {...listeners}
      onDoubleClick={
        onEdit && !overlay
          ? (e) => {
              e.stopPropagation();
              onEdit();
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="pr-1 font-medium leading-snug">{deal.title}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            priority.badge,
          )}
        >
          {priority.label}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatCurrency(deal.value, deal.currency)}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {daysLabel}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t pt-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400/80 via-violet-400/80 to-pink-400/80 text-[9px] font-semibold text-white">
          {initials}
        </span>
        {contact ? (
          <Link
            href={saPath(`/contacts/${contact.id}`)}
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground hover:text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {contact.name || contact.email || "Contact"}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground/60">
            Unknown contact
          </span>
        )}
        {scopingOn && territoryName && (
          <span
            className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
            title={`Territory: ${territoryName}`}
          >
            {territoryName}
          </span>
        )}
      </div>

      {deal.stageId === "won" && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={overlay ? undefined : toggleCompleted}
          disabled={overlay || savingCompleted}
          title={
            completed
              ? "Job delivered — click to unmark"
              : "Mark the job as delivered (can trigger a Google review request)"
          }
          className={cn(
            "mt-2 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
            completed
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-dashed text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400",
          )}
        >
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
              completed
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-muted-foreground/40",
            )}
          >
            {completed && <Check className="h-3 w-3" />}
          </span>
          {completed ? "Completed" : "Mark completed"}
        </button>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  rectIntersection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import {
  type Deal,
  type PipelineStage,
  type PipelineStageId,
} from "@/types/deals";
import type { Contact } from "@/types/contacts";
import { GLOBAL_TERRITORY_ID, type TerritoryDoc } from "@/types";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { DealCard } from "@/components/pipeline/deal-card";
import { EditDealDialog } from "@/components/pipeline/edit-deal-dialog";
import { LostReasonDialog } from "@/components/pipeline/lost-reason-dialog";

interface PipelineBoardProps {
  deals: Deal[];
  contacts: Contact[];
  territories: TerritoryDoc[];
}

/** Move a deal to a new stage via the server route so the stage webhooks fire. */
async function patchDealStage(
  dealId: string,
  stageId: PipelineStageId,
  lostReason?: string,
): Promise<void> {
  const res = await fetch(`/api/deals/${dealId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      lostReason !== undefined ? { stageId, lostReason } : { stageId },
    ),
  });
  if (!res.ok) throw new Error("move failed");
}

/** Resolve a deal's territoryId to a display name (falls back to "Global"). */
function territoryName(
  id: string | null | undefined,
  byId: Map<string, string>,
): string | undefined {
  if (!id) return undefined;
  return byId.get(id) ?? (id === GLOBAL_TERRITORY_ID ? "Global" : undefined);
}

const STAGE_ACCENT: Record<PipelineStageId, string> = {
  new: "from-slate-400 to-slate-500",
  contacted: "from-blue-400 to-blue-500",
  qualified: "from-indigo-400 to-indigo-500",
  proposal: "from-amber-400 to-amber-500",
  won: "from-emerald-400 to-emerald-500",
  lost: "from-rose-400 to-rose-500",
};

export function PipelineBoard({
  deals,
  contacts,
  territories,
}: PipelineBoardProps) {
  const contactById = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts) map.set(c.id, c);
    return map;
  }, [contacts]);

  const territoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of territories) map.set(t.id, t.name);
    return map;
  }, [territories]);

  // Configured stages (label/order overrides applied; ids + terminals
  // unchanged). Falls back to the canonical stages when none are set.
  const stages = usePipelineStages();

  const dealsByStage = useMemo(() => {
    const grouped = new Map<PipelineStageId, Deal[]>();
    for (const s of stages) grouped.set(s.id, []);
    for (const d of deals) {
      const stage = grouped.get(d.stageId as PipelineStageId);
      if (stage) stage.push(d);
      else grouped.get("new")?.push(d);
    }
    return grouped;
  }, [deals, stages]);

  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [pendingLost, setPendingLost] = useState<Deal | null>(null);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const editingDeal =
    deals.find((d) => d.id === editingDealId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragStart(e: DragStartEvent) {
    const deal = deals.find((d) => d.id === e.active.id);
    setActiveDeal(deal ?? null);
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveDeal(null);
    const overId = e.over?.id;
    if (!overId) return;
    const deal = deals.find((d) => d.id === e.active.id);
    if (!deal) return;
    const nextStageId = String(overId) as PipelineStageId;
    if (!stages.some((s) => s.id === nextStageId)) return;
    if (nextStageId === deal.stageId) return;

    if (nextStageId === "lost") {
      setPendingLost(deal);
      return;
    }

    try {
      await patchDealStage(deal.id, nextStageId);
      const label = stages.find((s) => s.id === nextStageId)?.label;
      toast.success(`Moved to ${label}`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't move deal. Try again.");
    }
  }

  async function confirmLost(reason: string) {
    if (!pendingLost) return;
    try {
      await patchDealStage(pendingLost.id, "lost", reason);
      toast.success(
        `Moved to ${stages.find((s) => s.id === "lost")?.label ?? "Lost"}`,
      );
    } catch (err) {
      console.error(err);
      toast.error("Couldn't move deal. Try again.");
    } finally {
      setPendingLost(null);
    }
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDeal(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              deals={dealsByStage.get(stage.id) ?? []}
              contactById={contactById}
              territoryNameById={territoryNameById}
              activeId={activeDeal?.id}
              onEditDeal={(id) => setEditingDealId(id)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDeal ? (
            <DealCard
              deal={activeDeal}
              contact={contactById.get(activeDeal.contactId)}
              territoryName={territoryName(
                activeDeal.territoryId,
                territoryNameById,
              )}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <LostReasonDialog
        open={!!pendingLost}
        dealTitle={pendingLost?.title}
        onCancel={() => setPendingLost(null)}
        onConfirm={confirmLost}
      />

      <EditDealDialog
        deal={editingDeal}
        open={!!editingDeal}
        onOpenChange={(o) => !o && setEditingDealId(null)}
        contacts={contacts}
        territories={territories}
      />
    </>
  );
}

function Column({
  stage,
  deals,
  contactById,
  territoryNameById,
  activeId,
  onEditDeal,
}: {
  stage: PipelineStage;
  deals: Deal[];
  contactById: Map<string, Contact>;
  territoryNameById: Map<string, string>;
  activeId?: string;
  onEditDeal: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((sum, d) => sum + (d.value || 0), 0);
  const currency = deals[0]?.currency ?? "USD";
  const accent = STAGE_ACCENT[stage.id];

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-[220px] flex-1 basis-0 flex-col overflow-hidden rounded-xl border bg-muted/20 transition-colors",
        isOver && "border-primary/60 bg-primary/5 ring-2 ring-primary/20",
      )}
    >
      <div
        className={cn("h-1 w-full bg-gradient-to-r", accent)}
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", stage.tone)}>
            {stage.label}
          </span>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {deals.length}
          </span>
        </div>
        {total > 0 && (
          <span className="truncate text-[11px] font-medium tabular-nums text-muted-foreground">
            {formatCurrency(total, currency)}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-2 p-2 pt-1">
        {deals.length === 0 ? (
          <EmptyCol />
        ) : (
          deals.map((deal) => (
            <DraggableDeal
              key={deal.id}
              deal={deal}
              contact={contactById.get(deal.contactId)}
              territoryName={territoryName(deal.territoryId, territoryNameById)}
              dragging={activeId === deal.id}
              onEdit={() => onEditDeal(deal.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableDeal({
  deal,
  contact,
  territoryName,
  dragging,
  onEdit,
}: {
  deal: Deal;
  contact: Contact | undefined;
  territoryName?: string;
  dragging: boolean;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: deal.id,
  });
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;
  return (
    <DealCard
      deal={deal}
      contact={contact}
      territoryName={territoryName}
      dragging={dragging}
      setNodeRef={setNodeRef}
      style={style}
      listeners={listeners as unknown as React.HTMLAttributes<HTMLElement>}
      attributes={attributes as unknown as React.HTMLAttributes<HTMLElement>}
      onEdit={onEdit}
    />
  );
}

function EmptyCol() {
  return (
    <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-center text-[11px] text-muted-foreground/60">
      Drop deals here
    </div>
  );
}

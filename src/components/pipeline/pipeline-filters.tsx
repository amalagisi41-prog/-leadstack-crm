"use client";

import { Check, ChevronDown, Filter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEAL_PRIORITIES,
  type DealPriority,
  type PipelineStageId,
} from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { TerritoryDoc } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface PipelineFilterState {
  stages: PipelineStageId[];
  priorities: DealPriority[];
  minValue: number | null;
  maxValue: number | null;
  countries: string[];
  /**
   * Admin-only filter when territory scoping is enabled. Empty array
   * means "all". When the toggle is off this stays empty and the
   * matching UI is hidden.
   */
  territories: string[];
}

export const EMPTY_FILTERS: PipelineFilterState = {
  stages: [],
  priorities: [],
  minValue: null,
  maxValue: null,
  countries: [],
  territories: [],
};

export function hasActiveFilters(f: PipelineFilterState): boolean {
  return (
    f.stages.length > 0 ||
    f.priorities.length > 0 ||
    f.minValue !== null ||
    f.maxValue !== null ||
    f.countries.length > 0 ||
    f.territories.length > 0
  );
}

export function activeFilterCount(f: PipelineFilterState): number {
  let n = 0;
  if (f.stages.length) n++;
  if (f.priorities.length) n++;
  if (f.minValue !== null || f.maxValue !== null) n++;
  if (f.countries.length) n++;
  if (f.territories.length) n++;
  return n;
}

interface PipelineFiltersProps {
  filters: PipelineFilterState;
  onChange: (next: PipelineFilterState) => void;
  /** Countries with at least one deal — drives the country dropdown options. */
  availableCountries: string[];
  /**
   * Active territories for the sub-account. Pass an empty array when
   * scoping is off (or when the caller is a collaborator) — the
   * territory filter chip won't render.
   */
  availableTerritories?: TerritoryDoc[];
  /**
   * Whether to show territory-related UI at all. Off when scoping is
   * disabled on the sub-account or when the caller isn't admin
   * (collaborators are already filtered server-side).
   */
  showTerritoryFilters?: boolean;
}

export function PipelineFilters({
  filters,
  onChange,
  availableCountries,
  availableTerritories = [],
  showTerritoryFilters = false,
}: PipelineFiltersProps) {
  const stages = usePipelineStages();
  const toggleStage = (id: PipelineStageId) => {
    const next = filters.stages.includes(id)
      ? filters.stages.filter((s) => s !== id)
      : [...filters.stages, id];
    onChange({ ...filters, stages: next });
  };

  const togglePriority = (p: DealPriority) => {
    const next = filters.priorities.includes(p)
      ? filters.priorities.filter((x) => x !== p)
      : [...filters.priorities, p];
    onChange({ ...filters, priorities: next });
  };

  const toggleCountry = (c: string) => {
    const next = filters.countries.includes(c)
      ? filters.countries.filter((x) => x !== c)
      : [...filters.countries, c];
    onChange({ ...filters, countries: next });
  };

  const toggleTerritory = (id: string) => {
    const next = filters.territories.includes(id)
      ? filters.territories.filter((x) => x !== id)
      : [...filters.territories, id];
    onChange({ ...filters, territories: next });
  };

  const activeTerritories = availableTerritories.filter(
    (t) => t.status === "active",
  );

  const setMin = (v: string) => {
    const n = v.trim() === "" ? null : Number(v);
    onChange({
      ...filters,
      minValue: typeof n === "number" && Number.isFinite(n) ? n : null,
    });
  };
  const setMax = (v: string) => {
    const n = v.trim() === "" ? null : Number(v);
    onChange({
      ...filters,
      maxValue: typeof n === "number" && Number.isFinite(n) ? n : null,
    });
  };

  const active = hasActiveFilters(filters);
  const count = activeFilterCount(filters);

  return (
    <section className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filters
          {count > 0 && (
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {count}
            </span>
          )}
        </div>

        {/* Stage chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Stage:
          </span>
          {stages.map((s) => {
            const on = filters.stages.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStage(s.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  on
                    ? s.tone + " ring-1 ring-current/40"
                    : "border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Priority chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Priority:
          </span>
          {DEAL_PRIORITIES.map((p) => {
            const on = filters.priorities.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePriority(p.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  on
                    ? p.badge
                    : "border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Value range */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Value:
          </span>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Min"
            value={filters.minValue ?? ""}
            onChange={(e) => setMin(e.target.value)}
            className="h-7 w-20 text-xs"
          />
          <span className="text-[11px] text-muted-foreground">to</span>
          <Input
            type="number"
            inputMode="numeric"
            placeholder="Max"
            value={filters.maxValue ?? ""}
            onChange={(e) => setMax(e.target.value)}
            className="h-7 w-24 text-xs"
          />
        </div>

        {/* Country dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Country:
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={availableCountries.length === 0}
                />
              }
            >
              {filters.countries.length === 0
                ? "All"
                : filters.countries.length === 1
                  ? filters.countries[0]
                  : `${filters.countries.length} selected`}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-72 w-56 overflow-y-auto p-1"
            >
              {availableCountries.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  No deals yet.
                </p>
              ) : (
                availableCountries.map((c) => {
                  const on = filters.countries.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCountry(c)}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted"
                    >
                      <span>{c}</span>
                      {on && <Check className="h-3 w-3 text-primary" />}
                    </button>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showTerritoryFilters && (
          <>
            {/* Territory dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Territory:
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={activeTerritories.length === 0}
                    />
                  }
                >
                  {filters.territories.length === 0
                    ? "All"
                    : filters.territories.length === 1
                      ? (activeTerritories.find(
                          (t) => t.id === filters.territories[0],
                        )?.name ?? "1 selected")
                      : `${filters.territories.length} selected`}
                  <ChevronDown className="h-3 w-3" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="max-h-72 w-56 overflow-y-auto p-1"
                >
                  {activeTerritories.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      No territories yet.
                    </p>
                  ) : (
                    activeTerritories.map((t) => {
                      const on = filters.territories.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTerritory(t.id)}
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted"
                        >
                          <span className="truncate">{t.name}</span>
                          {on && <Check className="h-3 w-3 text-primary" />}
                        </button>
                      );
                    })
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}

        {active && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground"
          >
            <X className="h-3 w-3" />
            Clear all
          </Button>
        )}
      </div>
    </section>
  );
}

"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import type { TerritoryDoc } from "@/types";

interface Props {
  value: string[];
  territories: TerritoryDoc[];
  disabled?: boolean;
  /** When `true`, render an "All territories (admin)" disabled chip. */
  adminLabel?: boolean;
  onChange: (next: string[]) => void;
  ariaLabel?: string;
}

/**
 * Multi-select popover for assigning territories to a sub-account
 * member. Mirrors the country-filter dropdown pattern in
 * pipeline-filters.tsx so the visual language stays consistent. Only
 * active territories are listed; archived ones aren't valid assignment
 * targets.
 */
export function TerritoryMultiSelect({
  value,
  territories,
  disabled,
  adminLabel,
  onChange,
  ariaLabel,
}: Props) {
  if (adminLabel) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
        All territories (admin)
      </span>
    );
  }

  const active = territories.filter((t) => t.status === "active");
  const toggle = (id: string) => {
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    );
  };

  const label =
    value.length === 0
      ? "No territories"
      : value.length === 1
        ? (active.find((t) => t.id === value[0])?.name ?? "1 selected")
        : `${value.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || active.length === 0}
            aria-label={ariaLabel}
            className="h-8 w-44 justify-between gap-1 px-2 text-xs"
          />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-72 w-56 overflow-y-auto p-1"
      >
        {active.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">
            No active territories.
          </p>
        ) : (
          active.map((t) => {
            const on = value.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggle(t.id)}
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
  );
}

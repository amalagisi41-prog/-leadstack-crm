"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { WorkingHour } from "@/types/booking";

/**
 * Weekly working-hours editor. Renders one row per day, with each row
 * holding any number of start/end ranges (multiple ranges support
 * lunch breaks / split shifts). Day labels follow JS Date convention
 * (0 = Sunday).
 *
 * Persists as the flat WorkingHour[] the validator expects — sorted on
 * change so the rendered order matches the persisted order.
 */

const DAYS: { value: WorkingHour["dayOfWeek"]; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function minutesToHHMM(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function hhmmToMinutes(s: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 24 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function sortAndCanonicalise(hours: WorkingHour[]): WorkingHour[] {
  return [...hours].sort((a, b) =>
    a.dayOfWeek === b.dayOfWeek
      ? a.startMinute - b.startMinute
      : a.dayOfWeek - b.dayOfWeek,
  );
}

export function WorkingHoursGrid({
  value,
  onChange,
  disabled,
}: {
  value: WorkingHour[];
  onChange: (next: WorkingHour[]) => void;
  disabled?: boolean;
}) {
  function rangesForDay(day: WorkingHour["dayOfWeek"]): WorkingHour[] {
    return value.filter((h) => h.dayOfWeek === day);
  }

  function addRange(day: WorkingHour["dayOfWeek"]) {
    // New range defaults to 9–17, or 18–20 if 9–17 is taken (so two ranges
    // on the same day don't visually collide at insert time). The
    // validator does the real overlap check on save.
    const existing = rangesForDay(day);
    const fallback: WorkingHour = {
      dayOfWeek: day,
      startMinute: existing.some((h) => h.startMinute < 540 + 30)
        ? 18 * 60
        : 9 * 60,
      endMinute: existing.some((h) => h.startMinute < 540 + 30)
        ? 20 * 60
        : 17 * 60,
    };
    onChange(sortAndCanonicalise([...value, fallback]));
  }

  function updateRange(idxToReplace: number, next: WorkingHour) {
    const flat = [...value];
    flat.splice(idxToReplace, 1, next);
    onChange(sortAndCanonicalise(flat));
  }

  function removeRange(idxToRemove: number) {
    const flat = [...value];
    flat.splice(idxToRemove, 1);
    onChange(flat);
  }

  return (
    <div className="space-y-2.5">
      <Label className="text-sm">Working hours</Label>
      <p className="text-xs text-muted-foreground">
        Times are in the page&apos;s timezone (set below). Add multiple
        ranges per day for split shifts; leave blank for a day off.
      </p>
      <ul className="space-y-1.5">
        {DAYS.map((d) => {
          const dayRanges = rangesForDay(d.value);
          return (
            <li
              key={d.value}
              className="flex flex-wrap items-start gap-2 rounded-lg border bg-background px-3 py-2"
            >
              <span className="mt-1.5 w-10 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {d.label}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                {dayRanges.length === 0 && (
                  <span className="block py-1.5 text-xs text-muted-foreground">
                    Closed
                  </span>
                )}
                {dayRanges.map((r) => {
                  const flatIdx = value.indexOf(r);
                  return (
                    <div key={flatIdx} className="flex items-center gap-1.5">
                      <input
                        type="time"
                        value={minutesToHHMM(r.startMinute)}
                        onChange={(e) => {
                          const m = hhmmToMinutes(e.target.value);
                          if (m === null) return;
                          updateRange(flatIdx, { ...r, startMinute: m });
                        }}
                        disabled={disabled}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                      <span className="text-xs text-muted-foreground">
                        to
                      </span>
                      <input
                        type="time"
                        value={minutesToHHMM(r.endMinute)}
                        onChange={(e) => {
                          const m = hhmmToMinutes(e.target.value);
                          if (m === null) return;
                          updateRange(flatIdx, { ...r, endMinute: m });
                        }}
                        disabled={disabled}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRange(flatIdx)}
                        disabled={disabled}
                        aria-label="Remove this range"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addRange(d.value)}
                  disabled={disabled}
                  className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {dayRanges.length === 0 ? "Add hours" : "Add another range"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

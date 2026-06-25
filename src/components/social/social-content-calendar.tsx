"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Facebook, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SocialPostDoc, SocialPostStatus } from "@/types/social";

/**
 * Content calendar for the Social Planner — a month grid of scheduled +
 * published posts. Self-contained (own month state); does not touch the
 * shared CRM calendar component. Drafts (no `scheduledAt`) don't appear here —
 * they live in the Drafts strip on the page. Click a post chip to manage it.
 */

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate();
  if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  return null;
}

const STATUS_DOT: Record<SocialPostStatus, string> = {
  draft: "bg-zinc-400",
  scheduled: "bg-blue-500",
  publishing: "bg-amber-500",
  published: "bg-emerald-500",
  failed: "bg-red-500",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SocialContentCalendar({
  posts,
  onSelectPost,
}: {
  posts: SocialPostDoc[];
  onSelectPost?: (post: SocialPostDoc) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // Bucket posts by yyyy-mm-dd of their scheduledAt.
  const byDay = useMemo(() => {
    const map = new Map<string, SocialPostDoc[]>();
    for (const p of posts) {
      const d = toDate(p.scheduledAt);
      if (!d) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [posts]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Monday-first grid math.
  const firstOfMonth = new Date(year, month, 1);
  const jsDow = firstOfMonth.getDay(); // 0 = Sun
  const leadBlanks = (jsDow + 6) % 7; // shift so Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: leadBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === day;

  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
            }
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const key =
            day != null ? `${year}-${month}-${day}` : `blank-${i}`;
          const dayPosts = day != null ? (byDay.get(key) ?? []) : [];
          return (
            <div
              key={key}
              className={cn(
                "min-h-[92px] border-b border-r p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0",
                day == null && "bg-muted/20",
              )}
            >
              {day != null && (
                <>
                  <div
                    className={cn(
                      "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                      isToday(day)
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {day}
                  </div>
                  <div className="space-y-1">
                    {dayPosts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectPost?.(p)}
                        className="flex w-full items-center gap-1 rounded bg-muted/60 px-1.5 py-1 text-left text-[11px] hover:bg-muted"
                        title={p.caption || "(no caption)"}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            STATUS_DOT[p.status],
                          )}
                        />
                        {p.targets.includes("facebook") && (
                          <Facebook className="h-3 w-3 shrink-0 text-blue-500" />
                        )}
                        {p.targets.includes("instagram") && (
                          <Instagram className="h-3 w-3 shrink-0 text-pink-500" />
                        )}
                        <span className="truncate">
                          {p.caption || "(no caption)"}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

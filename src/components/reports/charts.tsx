"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface Point {
  x: string;
  y: number;
}

/** Lightweight area/line chart in a responsive SVG viewBox. */
export function AreaChart({
  data,
  height = 140,
  className,
  tone = "indigo",
}: {
  data: Point[];
  height?: number;
  className?: string;
  tone?: "indigo" | "emerald" | "amber" | "violet";
}) {
  const id = useId().replace(/:/g, "");
  const w = 600;
  const h = height;
  const padX = 20;
  const padY = 18;
  const max = Math.max(1, ...data.map((d) => d.y));
  const stepX = data.length > 1 ? (w - 2 * padX) / (data.length - 1) : 0;

  const pts = data.map((d, i) => {
    const x = padX + i * stepX;
    const y = h - padY - (d.y / max) * (h - 2 * padY);
    return [x, y] as const;
  });

  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area =
    pts.length > 0
      ? `M ${pts[0][0].toFixed(1)},${(h - padY).toFixed(1)} L ${line
          .split(" ")
          .join(" L ")} L ${pts[pts.length - 1][0].toFixed(1)},${(h - padY).toFixed(1)} Z`
      : "";

  const strokeByTone: Record<string, string> = {
    indigo: "stroke-indigo-500",
    emerald: "stroke-emerald-500",
    amber: "stroke-amber-500",
    violet: "stroke-violet-500",
  };
  const fillByTone: Record<string, { from: string; to: string }> = {
    indigo: { from: "rgb(99 102 241 / 0.35)", to: "rgb(99 102 241 / 0)" },
    emerald: { from: "rgb(16 185 129 / 0.35)", to: "rgb(16 185 129 / 0)" },
    amber: { from: "rgb(245 158 11 / 0.35)", to: "rgb(245 158 11 / 0)" },
    violet: { from: "rgb(139 92 246 / 0.35)", to: "rgb(139 92 246 / 0)" },
  };

  const labels = labelIndices(data.length, 4);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-auto w-full", className)}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fillByTone[tone].from} />
          <stop offset="100%" stopColor={fillByTone[tone].to} />
        </linearGradient>
      </defs>
      {/* Baseline grid */}
      {[0.25, 0.5, 0.75].map((f) => {
        const y = padY + f * (h - 2 * padY);
        return (
          <line
            key={f}
            x1={padX}
            x2={w - padX}
            y1={y}
            y2={y}
            className="stroke-border"
            strokeDasharray="2 3"
            strokeWidth="0.5"
          />
        );
      })}
      {pts.length > 0 && (
        <>
          <path d={area} fill={`url(#grad-${id})`} />
          <polyline
            points={line}
            fill="none"
            className={cn("stroke-[1.5]", strokeByTone[tone])}
          />
          {pts.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={2}
              className={cn("fill-background stroke-[1.5]", strokeByTone[tone])}
            />
          ))}
        </>
      )}
      {/* X axis labels */}
      {labels.map((i) => (
        <text
          key={i}
          x={padX + i * stepX}
          y={h - 2}
          textAnchor="middle"
          className="fill-muted-foreground text-[9px]"
        >
          {data[i]?.x ?? ""}
        </text>
      ))}
    </svg>
  );
}

/** Horizontal bar funnel. */
export function FunnelChart({
  data,
  formatValue,
}: {
  data: { label: string; value: number; secondary?: string; tone?: string }[];
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={d.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">{d.label}</span>
              <span className="text-muted-foreground">
                {formatValue ? formatValue(d.value) : d.value}
                {d.secondary && (
                  <span className="ml-2 text-muted-foreground/60">
                    {d.secondary}
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  d.tone ??
                    "bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact donut chart. */
export function DonutChart({
  data,
  size = 160,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const stroke = size * 0.16;
  let acc = 0;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          className="fill-none stroke-muted"
          strokeWidth={stroke}
        />
        {data.map((d) => {
          const frac = d.value / total;
          const dasharray = `${frac * circumference} ${circumference}`;
          const dashoffset = -acc * circumference;
          acc += frac;
          return (
            <circle
              key={d.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: d.color }}
            />
            <span className="truncate">{d.label}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              {d.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Slim vertical bar chart. */
export function BarChart({
  data,
  height = 100,
  tone = "indigo",
}: {
  data: Point[];
  height?: number;
  tone?: "indigo" | "emerald" | "violet" | "amber";
}) {
  const max = Math.max(1, ...data.map((d) => d.y));
  const labels = labelIndices(data.length, 4);
  const toneClass: Record<string, string> = {
    indigo: "bg-indigo-500/70",
    emerald: "bg-emerald-500/70",
    violet: "bg-violet-500/70",
    amber: "bg-amber-500/70",
  };
  return (
    <div>
      <div
        className="flex items-end gap-[2px]"
        style={{ height: `${height}px` }}
      >
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1"
            title={`${d.x}: ${d.y}`}
          >
            <div
              className={cn("mx-auto w-full rounded-t-sm", toneClass[tone])}
              style={{ height: `${Math.max(2, (d.y / max) * height)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        {labels.map((i) => (
          <span key={i}>{data[i]?.x ?? ""}</span>
        ))}
      </div>
    </div>
  );
}

function labelIndices(total: number, count: number): number[] {
  if (total <= count) return Array.from({ length: total }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.round(((total - 1) * i) / (count - 1)));
  }
  return out;
}

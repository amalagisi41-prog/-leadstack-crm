"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import {
  buildChannelHref,
  type AiChannel,
} from "@/components/ai-agents/channels";
import { cn } from "@/lib/utils";

interface ChannelStatusCardProps {
  channel: AiChannel;
  /** Only meaningful for shipped channels. Undefined = not yet checked. */
  enabled?: boolean;
}

export function ChannelStatusCard({
  channel,
  enabled,
}: ChannelStatusCardProps) {
  const { subAccountId } = useSubAccount();
  const href = buildChannelHref(subAccountId, channel);
  const Icon = channel.icon;

  const statusLabel = channel.comingSoon
    ? "Coming soon"
    : enabled
      ? "Active"
      : "Not configured";

  const statusClass = channel.comingSoon
    ? "bg-muted text-muted-foreground"
    : enabled
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "bg-amber-500/10 text-amber-700 dark:text-amber-400";

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/20",
        channel.comingSoon && "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Icon className="h-5 w-5" />
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            statusClass,
          )}
        >
          {!channel.comingSoon && enabled ? (
            <CheckCircle2 className="h-2.5 w-2.5" />
          ) : (
            <Circle className="h-2.5 w-2.5" />
          )}
          {statusLabel}
        </span>
      </div>

      <h3 className="mt-4 text-base font-semibold tracking-tight">
        {channel.label}
      </h3>
      <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">
        {channel.blurb}
      </p>

      <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        {channel.comingSoon ? "Learn more" : "Configure"}
        <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

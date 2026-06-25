"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSubAccount } from "@/context/sub-account-context";
import {
  VISIBLE_AI_CHANNELS,
  buildChannelHref,
} from "@/components/ai-agents/channels";
import { cn } from "@/lib/utils";

/**
 * Horizontal tabs nav for the AI Agents area. Renders once at the layout
 * level so every channel page shares the same chrome.
 *
 * Tabs are colored by direction group so the surface reads at a glance:
 *   - inbound channels (the AI reacts) → violet
 *   - outbound (the AI calls out)      → orange, after a divider
 */
export function ChannelNav() {
  const pathname = usePathname();
  const { subAccountId } = useSubAccount();
  const baseHref = `/sa/${subAccountId}/ai-agents`;

  return (
    <div className="flex items-center overflow-x-auto border-b">
      {VISIBLE_AI_CHANNELS.map((channel, i) => {
        const href = buildChannelHref(subAccountId, channel);
        const isActive =
          channel.id === "overview"
            ? pathname === baseHref
            : pathname.startsWith(href);
        const Icon = channel.icon;
        const outbound = channel.group === "outbound";
        // Divider between the inbound group and the first outbound tab.
        const prev = VISIBLE_AI_CHANNELS[i - 1];
        const showDivider = prev && prev.group !== channel.group;

        return (
          <Fragment key={channel.id}>
            {showDivider && (
              <span
                aria-hidden
                className="mx-1 h-5 w-px shrink-0 bg-border"
              />
            )}
            <Link
              href={href}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors",
                isActive
                  ? cn(
                      "font-medium text-foreground",
                      outbound ? "border-orange-500" : "border-violet-500",
                    )
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5",
                  outbound
                    ? "text-orange-500/80"
                    : "text-violet-500/70",
                )}
              />
              {channel.label}
              {channel.beta && (
                <span className="rounded-sm bg-violet-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-violet-600 dark:text-violet-400">
                  beta
                </span>
              )}
            </Link>
          </Fragment>
        );
      })}
    </div>
  );
}

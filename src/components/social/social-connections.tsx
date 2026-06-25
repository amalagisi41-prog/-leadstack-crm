"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Facebook,
  Instagram,
  Settings,
  XCircle,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { metaCanPublish } from "@/lib/comms/meta-capabilities";
import { Button } from "@/components/ui/button";

/**
 * Social Planner — Connections tab. READ-ONLY status view of the single shared
 * Meta connection (the same `metaConfig` the inbox uses). All connect /
 * reconnect / disconnect lives in Settings → Facebook & Instagram so there's
 * one source of truth; this tab just reflects whether posting is ready and
 * deep-links there.
 */
export function SocialConnections() {
  const { subAccount, saPath } = useSubAccount();
  const cfg = subAccount?.metaConfig ?? null;
  const connected = !!cfg?.connected;
  const canPublish = metaCanPublish(cfg);
  const settingsHref = saPath("/dashboard/settings");

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <header className="mb-4 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
            <Facebook className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Connected account</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The Social Planner publishes through the same Facebook /
              Instagram connection as your inbox. Manage that connection in
              Settings — this tab just shows whether posting is ready.
            </p>
          </div>
        </header>

        <div className="rounded-lg border bg-background p-4">
          {canPublish ? (
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <Facebook className="h-4 w-4 text-blue-500" />
                {cfg?.pageName || "Facebook Page"} — posting enabled
              </p>
              {cfg?.instagramUsername ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Instagram className="h-3.5 w-3.5 text-pink-500" />@
                  {cfg.instagramUsername}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No Instagram business account linked — Facebook only.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                {connected ? (
                  <XCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
                {connected
                  ? "Connected, but posting isn't enabled"
                  : "No account connected"}
              </p>
              <p className="text-xs text-muted-foreground">
                {connected
                  ? "This connection was authorised without posting permission. Reconnect and approve posting access to schedule posts."
                  : "Connect a Facebook Page (with posting permission) to start scheduling posts."}
              </p>
            </div>
          )}

          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              render={<Link href={settingsHref} />}
            >
              <Settings className="mr-1 h-3.5 w-3.5" />
              Manage connection in Settings
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

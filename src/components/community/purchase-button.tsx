"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

/**
 * Starts a one-time purchase (group access or a course), then surfaces the
 * sub-account's connected payment portal link to pay at (any provider —
 * PayPal.me, Venmo, Square, etc). v1 is manual-reconcile: after paying, a
 * staff admin marks the purchase paid to grant access. When no portal is
 * connected, the request still lands and the member is told the owner will
 * follow up. Used on the About page (group) and the classroom catalog
 * (course).
 */
export function PurchaseButton({
  saId,
  groupId,
  scope,
  targetId,
  label,
  brand,
  className,
}: {
  saId: string;
  groupId: string;
  scope: "group" | "course";
  targetId: string;
  label: string;
  brand: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, targetId }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        portalUrl?: string | null;
        error?: string;
      };
      if (!res.ok || !d.ok) {
        throw new Error(d.error ?? "Couldn't start purchase");
      }
      setPortalUrl(d.portalUrl ?? null);
      setRequested(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start purchase");
    } finally {
      setBusy(false);
    }
  }

  if (portalUrl) {
    return (
      <div className="space-y-1.5">
        <a
          href={portalUrl}
          target="_blank"
          rel="noreferrer"
          className={
            className ??
            "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white"
          }
          style={{ backgroundColor: brand }}
        >
          Pay now <ExternalLink className="h-4 w-4" />
        </a>
        <p className="text-center text-xs text-[#909090]">
          After you pay, the group owner confirms it and unlocks your access.
        </p>
      </div>
    );
  }

  if (requested) {
    return (
      <p className="text-center text-xs text-[#909090]">
        Request sent — the group owner will follow up to arrange payment
        and unlock your access.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        onClick={start}
        disabled={busy}
        className={
          className ??
          "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        }
        style={{ backgroundColor: brand }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </button>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}

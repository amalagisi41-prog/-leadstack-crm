"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MapPinned } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildRprHomeUrl, parseRprOrgId } from "@/lib/rpr/link";
import { findRprBoard, VERIFIED_RPR_BOARDS } from "@/lib/rpr/boards";

/** Sentinel for the "my MLS isn't listed" escape hatch in the picker. */
const OTHER_BOARD = "__other";

/**
 * RPR (Realtors Property Resource) org code — powers the "View on RPR"
 * button on the property workspace. Not a credential: it's RPR's own public
 * MLS-SSO board identifier (e.g. "ctconnm-n" for SmartMLS/connectMLS in
 * Connecticut), visible in RPR's own URLs once an agent is signed in via
 * their MLS. Find it by logging into your MLS, opening RPR, and copying the
 * `cbcode` value from the URL (e.g. narrpr.com/home?cbcode=ctconnm-n).
 *
 * We never call RPR's API or store any RPR data — this only builds a link
 * that sends the agent into their own RPR session.
 */

export function SubAccountRprSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const rprOrgId = subAccount?.rprOrgId ?? null;
  const connected = !!rprOrgId;

  const [boardChoice, setBoardChoice] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const selectedBoard =
    boardChoice && boardChoice !== OTHER_BOARD
      ? findRprBoard(boardChoice)
      : null;
  const detectedOrgId = parseRprOrgId(value);
  // The picker wins; the paste box only matters on the "not listed" path.
  const submitOrgId = selectedBoard?.orgId ?? (boardChoice === OTHER_BOARD ? detectedOrgId : null);

  if (!isAdmin) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!submitOrgId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/rpr-integration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rprOrgId: submitOrgId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Failed to save the RPR org code.");
      setValue("");
      setBoardChoice("");
      toast.success("RPR connected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Remove the RPR org code? The \"View on RPR\" button will be locked until you set it again."))
      return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/rpr-integration`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Failed to disconnect.");
      toast.success("RPR disconnected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <MapPinned className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">RPR (Realtors Property Resource)</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Adds a &quot;View on RPR&quot; button to each property so you can pull
            comps, CMAs, and valuation data from your own RPR account. Pick
            your MLS below — that&apos;s all we need. You&apos;ll still sign
            into RPR the way you always do, through your MLS.
          </p>
        </div>
      </header>

      {connected ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Connected —{" "}
            <a
              href={buildRprHomeUrl(rprOrgId!)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline-offset-4 hover:underline"
            >
              open RPR
            </a>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            We never fetch or store RPR data — this just sends you into your
            own RPR account via your MLS sign-in. RPR doesn&apos;t support
            jumping straight to a specific property from outside its site, so
            the button also copies the property address so you can paste it
            into RPR&apos;s search box.
          </p>
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Disconnecting…
                </>
              ) : (
                "Disconnect"
              )}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          {/* Primary path: name your MLS, we supply the code. An agent
              signs into their MLS daily and knows it by name; nobody
              knows what a "cbcode" is. */}
          <div className="space-y-1.5">
            <Label htmlFor="rpr-board">Which MLS are you a member of?</Label>
            <select
              id="rpr-board"
              value={boardChoice}
              onChange={(e) => setBoardChoice(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Choose your MLS…</option>
              {VERIFIED_RPR_BOARDS.map((board) => (
                <option key={board.orgId} value={board.orgId}>
                  {board.label} — {board.region}
                </option>
              ))}
              <option value={OTHER_BOARD}>My MLS isn&apos;t listed</option>
            </select>
          </div>

          {selectedBoard && (
            <p className="flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Nothing else to enter — we&apos;ll send you into RPR through{" "}
                {selectedBoard.label}. Click Connect RPR.
              </span>
            </p>
          )}

          {/* Fallback, only when their board isn't in the verified list.
              Never a blocker — just a slightly longer path. */}
          {boardChoice === OTHER_BOARD && (
            <div className="space-y-1.5">
              <Label htmlFor="rpr-org-id">Paste your RPR link</Label>
              <Input
                id="rpr-org-id"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="narrpr.com/home?cbcode=ctconnm-n"
                autoComplete="off"
                spellCheck={false}
              />
              {/* Echo what we pulled out before they commit, so a paste that
                  grabbed the wrong value is visible up front. */}
              {value.trim() && detectedOrgId && (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Found your MLS code: <strong>{detectedOrgId}</strong>
                </p>
              )}
              {value.trim() && !detectedOrgId && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  No MLS code in that yet — copy the whole address from your
                  browser while RPR is open, and paste it here.
                </p>
              )}
              <ol className="text-muted-foreground list-decimal space-y-0.5 pl-4 text-[11px]">
                <li>Sign into your MLS the way you normally do.</li>
                <li>Open RPR from your MLS dashboard.</li>
                <li>
                  Copy the whole web address from the bar at the top of your
                  browser and paste it above.
                </li>
              </ol>
              <p className="text-[11px] text-muted-foreground">
                We don&apos;t store any RPR password — just the public code
                that identifies your MLS.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" size="sm" disabled={saving || !submitOrgId}>
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Connect RPR"
              )}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

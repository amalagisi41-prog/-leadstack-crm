"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MapPinned } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildRprHomeUrl, parseRprOrgId } from "@/lib/rpr/link";

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

  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const detectedOrgId = parseRprOrgId(value);

  if (!isAdmin) return null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/rpr-integration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send whatever they pasted; the route extracts the code. Parsing
        // here too only drives the live preview below.
        body: JSON.stringify({ rprOrgId: value.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok)
        throw new Error(data.error ?? "Failed to save the RPR org code.");
      setValue("");
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
            Adds a &quot;View on RPR&quot; button to each property so you can pull comps,
            CMAs, and valuation data from your own RPR account. Sign into RPR
            through your MLS, then copy the URL from your browser&apos;s
            address bar and paste the whole thing below — we&apos;ll find the
            board code in it (e.g. narrpr.com/home?cbcode=
            <strong>ctconnm-n</strong>).
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
          <div className="space-y-1.5">
            <Label htmlFor="rpr-org-id">Your RPR URL (or just the org code)</Label>
            <Input
              id="rpr-org-id"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="narrpr.com/home?cbcode=ctconnm-n"
              autoComplete="off"
              spellCheck={false}
            />
            {/* Confirm what we pulled out before they commit, so a paste
                that silently grabbed the wrong value is visible up front. */}
            {value.trim() && detectedOrgId && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Found your org code: <strong>{detectedOrgId}</strong>
              </p>
            )}
            {value.trim() && !detectedOrgId && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                No org code found in that yet — paste the full RPR URL from
                your browser&apos;s address bar, or just the code itself.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Sign into RPR through your MLS, then paste the whole URL here —
              we&apos;ll pull the code out. We don&apos;t store any RPR
              credentials, just this public board code.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button type="submit" size="sm" disabled={saving || !detectedOrgId}>
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

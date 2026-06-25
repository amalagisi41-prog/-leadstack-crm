"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  Mail,
  Trash2,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sub-account email sending-domain settings panel (platform-managed model).
 *
 * Off by default: the sub-account sends from the shared deployment EMAIL_FROM
 * until a dedicated domain is verified. Flow:
 *   1. Operator enters a SUBDOMAIN (e.g. mail.acme.com) + optional From name.
 *   2. POST /api/sub-accounts/[id]/resend registers it with Resend and returns
 *      DNS records to add at the tenant's registrar.
 *   3. Operator adds the records, then clicks Verify → POST .../resend/verify.
 *   4. Once status === "verified", outbound email for this sub-account sends
 *      from their own domain (resolved server-side by `tenantFrom`).
 *
 * DNS records are display-only — never persisted; re-fetched on mount via GET.
 */

interface DnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
}

function CopyValue({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 break-all rounded bg-background px-2 py-1 text-[11px]">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast.success("Copied");
        }}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "verified"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "failed"
        ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  const label =
    status === "verified"
      ? "Verified"
      : status === "failed"
        ? "Verification failed"
        : "Pending verification";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function ReplyToBanner({
  saPath,
  action,
}: {
  saPath: (path: string) => string;
  action: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">Set a Reply-To address first</p>
        <p className="mt-1">
          Replies to broadcasts and automated emails come back to your Reply-To
          address. Once you send from your own subdomain, that subdomain has no
          inbox by default — replies to it will bounce unless Reply-To routes
          them elsewhere. Set one on the{" "}
          <Link
            href={saPath("/automations/settings")}
            className="underline hover:no-underline"
          >
            Automations settings page
          </Link>
          , then come back here to {action}.
        </p>
      </div>
    </div>
  );
}

export function SubAccountEmailDomainSection() {
  const { subAccountId, subAccount, isAdmin, saPath } = useSubAccount();
  const cfg = subAccount?.resendConfig ?? null;
  const gateOpen = subAccount?.emailDomainEnabledByAgency === true;
  const needsReplyTo = !subAccount?.replyToEmail?.trim();

  const [domainName, setDomainName] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromLocalPart, setFromLocalPart] = useState("");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);

  const loadRecords = useCallback(async () => {
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/resend`);
      const data = (await res.json().catch(() => ({}))) as {
        records?: DnsRecord[];
      };
      if (Array.isArray(data.records)) setRecords(data.records);
    } catch {
      /* non-fatal: operator can still click Verify */
    }
  }, [subAccountId]);

  // Re-fetch DNS records when a pending domain exists (records aren't stored).
  useEffect(() => {
    setRecords([]);
    if (cfg && cfg.status !== "verified") void loadRecords();
  }, [cfg, loadRecords]);

  if (!isAdmin) return null;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainName: domainName.trim(),
          fromName: fromName.trim() || undefined,
          fromLocalPart: fromLocalPart.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        records?: DnsRecord[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to add the domain.");
      }
      setRecords(data.records ?? []);
      toast.success("Domain registered. Add the DNS records, then verify.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add domain.");
    } finally {
      setAdding(false);
    }
  }

  async function handleVerify() {
    setVerifying(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/resend/verify`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        status?: string;
        records?: DnsRecord[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Verification failed.");
      }
      if (Array.isArray(data.records)) setRecords(data.records);
      if (data.status === "verified") {
        toast.success("Domain verified. This sub-account now sends from it.");
      } else {
        toast.info(
          "Not verified yet — DNS can take a few minutes to propagate. Try again shortly.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleRemove() {
    if (
      !confirm(
        "Remove this sending domain? Email for this sub-account reverts to the shared sender. The domain is deleted from Resend — re-adding it later requires verifying DNS again.",
      )
    ) {
      return;
    }
    setRemoving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/resend`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to remove the domain.");
      }
      setRecords([]);
      setDomainName("");
      setFromName("");
      setFromLocalPart("");
      toast.success("Sending domain removed. Reverted to the shared sender.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Email sending domain</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Send this sub-account&apos;s email from its own domain instead of
            the shared sender. Add a subdomain, drop in the DNS records, and
            verify. Off by default — until verified, email uses the shared
            deployment sender.
          </p>
        </div>
      </header>

      {!gateOpen ? (
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-muted-foreground">
            <p className="font-medium text-foreground">
              Disabled by your agency
            </p>
            <p className="mt-1">
              Email for this sub-account is sending from the shared deployment
              address. Ask your agency owner to enable the dedicated sending
              domain feature from the agency sub-accounts page.
            </p>
          </div>
        </div>
      ) : !cfg && needsReplyTo ? (
        <ReplyToBanner saPath={saPath} action="add your domain" />
      ) : !cfg ? (
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="resend-domain">Sending subdomain</Label>
              <Input
                id="resend-domain"
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                placeholder="mail.yourdomain.com"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground">
                Use a subdomain (e.g. <code>mail.acme.com</code>), not your root
                domain — it keeps your main domain&apos;s reputation isolated.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resend-from-name">From name (optional)</Label>
              <Input
                id="resend-from-name"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder={subAccount?.name ?? "Your business"}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resend-from-local">Send-from mailbox</Label>
              <Input
                id="resend-from-local"
                value={fromLocalPart}
                onChange={(e) => setFromLocalPart(e.target.value)}
                placeholder="hello"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground">
                The part before the @. Defaults to <code>hello</code>.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Button type="submit" size="sm" disabled={adding}>
              {adding ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  Registering…
                </>
              ) : (
                "Add domain & get DNS records"
              )}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {needsReplyTo && (
            <ReplyToBanner saPath={saPath} action="verify your domain" />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{cfg.emailFrom}</p>
              <p className="text-xs text-muted-foreground">{cfg.domainName}</p>
            </div>
            <StatusBadge status={cfg.status} />
          </div>

          {cfg.status === "verified" ? (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Verified. This sub-account&apos;s email now sends from{" "}
              {cfg.domainName}.
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                <p className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Add these records at your DNS provider (GoDaddy, Cloudflare,
                    etc.), then click Verify. DNS changes can take a few minutes
                    to propagate.
                  </span>
                </p>
              </div>

              {records.length > 0 && (
                <div className="space-y-3">
                  {records.map((r, i) => (
                    <div
                      key={`${r.type}-${r.name}-${i}`}
                      className="space-y-2 rounded-lg border bg-muted/30 p-3"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <span className="rounded bg-background px-1.5 py-0.5 uppercase tracking-wide">
                          {r.type}
                        </span>
                        {r.record && (
                          <span className="text-muted-foreground">
                            {r.record}
                          </span>
                        )}
                        {typeof r.priority === "number" && (
                          <span className="text-muted-foreground">
                            priority {r.priority}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">Name</p>
                        <CopyValue value={r.name} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">
                          Value
                        </p>
                        <CopyValue value={r.value} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={removing || verifying}
              onClick={handleRemove}
            >
              {removing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              Remove
            </Button>
            {cfg.status !== "verified" && (
              <Button
                type="button"
                size="sm"
                disabled={verifying || needsReplyTo}
                onClick={handleVerify}
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    Checking…
                  </>
                ) : (
                  "Verify domain"
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

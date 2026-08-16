"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Server,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  assessEmailRisk,
  emailSurvivedCutover,
  formatRecordForCopy,
  identifyDnsHost,
  nameserversMatch,
  recordsToPreserve,
  type DnsRecordSnapshot,
  type DomainDnsSnapshot,
} from "@/lib/dns/records";

/**
 * The DNS cutover, for someone who has never done it.
 *
 * The ordering here is the whole product. A first-timer's instinct — and most
 * written guides — is to change the nameservers first and sort the records
 * out afterwards. That takes their email down, silently, because MX and the
 * SPF/DKIM/DMARC records lived at the old host. They find out days later from
 * a client who never got a reply.
 *
 * So the nameserver step is *locked* until the email records have been
 * re-created and confirmed. Not warned about — locked. And the agent is never
 * asked to know their own records: AgentStack reads them and prints the exact
 * rows to copy.
 */

type StepState = "done" | "active" | "locked";

function StepShell({
  step,
  title,
  description,
  state,
  children,
}: {
  step: number;
  title: string;
  description: string;
  state: StepState;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-white p-5">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            state === "done"
              ? "bg-emerald-600 text-white"
              : state === "active"
                ? "bg-blue-700 text-white"
                : "bg-slate-200 text-slate-500"
          }`}
        >
          {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            {state === "locked" ? (
              <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold">
                <Lock className="h-3 w-3" /> Locked
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 text-sm leading-6">
            {description}
          </p>
          {state !== "locked" ? children : null}
        </div>
      </div>
    </section>
  );
}

function RecordRow({ record }: { record: DnsRecordSnapshot }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(record.value);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy — select the text and copy it manually.");
    }
  };
  return (
    <tr className="border-t">
      <td className="py-2 pr-3 font-mono text-xs font-semibold">
        {record.kind}
      </td>
      <td className="py-2 pr-3 font-mono text-xs">{record.name || "@"}</td>
      {record.kind === "MX" ? (
        <td className="py-2 pr-3 font-mono text-xs">{record.priority ?? 10}</td>
      ) : null}
      <td className="py-2 pr-3">
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">
            {record.value}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            className="text-muted-foreground hover:text-foreground shrink-0 rounded p-1"
            aria-label={`Copy ${record.kind} record value`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function RecordTable({
  records,
  caption,
}: {
  records: DnsRecordSnapshot[];
  caption: string;
}) {
  const hasMx = records.some((r) => r.kind === "MX");

  /** Save the whole set somewhere safe before anything changes. */
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(
        records.map(formatRecordForCopy).join("\n")
      );
      toast.success("All rows copied — paste them somewhere safe.");
    } catch {
      toast.error("Could not copy — select the table and copy it manually.");
    }
  };

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border">
      <div className="flex items-center justify-between gap-3 px-3 pt-2">
        <span className="text-muted-foreground text-xs">
          {records.length} {records.length === 1 ? "record" : "records"}
        </span>
        <Button size="sm" variant="outline" onClick={() => void copyAll()}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          Copy all as backup
        </Button>
      </div>
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="text-muted-foreground px-3 py-2 text-left text-xs">
          {caption}
        </caption>
        <thead className="bg-muted/50 text-muted-foreground text-[11px] uppercase">
          <tr>
            <th className="px-3 py-2 font-semibold">Type</th>
            <th className="px-3 py-2 font-semibold">Name</th>
            {hasMx ? (
              <th className="px-3 py-2 font-semibold">Priority</th>
            ) : null}
            <th className="px-3 py-2 font-semibold">Value</th>
          </tr>
        </thead>
        <tbody className="px-3">{records.map((record, i) => (
          <RecordRow key={`${record.kind}-${record.name}-${i}`} record={record} />
        ))}</tbody>
      </table>
    </div>
  );
}

export function DnsCutoverWizard({
  subAccountId,
  /** Nameservers the domain should end up on, e.g. Cloudflare's pair. */
  targetNameservers,
  /** Website records the new host needs, shown in step 3. */
  targetWebsiteRecords = [],
}: {
  subAccountId: string;
  targetNameservers: string[];
  targetWebsiteRecords?: DnsRecordSnapshot[];
}) {
  const [before, setBefore] = useState<DomainDnsSnapshot | null>(null);
  const [after, setAfter] = useState<DomainDnsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [websiteAdded, setWebsiteAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    const response = await fetch(`/api/sub-accounts/${subAccountId}/dns/lookup`);
    const data = (await response.json().catch(() => ({}))) as {
      snapshot?: DomainDnsSnapshot;
      error?: string;
    };
    if (!response.ok || !data.snapshot) {
      throw new Error(data.error ?? "Could not read your domain's DNS.");
    }
    return data.snapshot;
  }, [subAccountId]);

  useEffect(() => {
    let active = true;
    lookup()
      .then((snapshot) => {
        if (!active) return;
        setBefore(snapshot);
        setError(null);
      })
      .catch((cause: Error) => active && setError(cause.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lookup]);

  async function recheck() {
    setRechecking(true);
    try {
      setAfter(await lookup());
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not check DNS."
      );
    } finally {
      setRechecking(false);
    }
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center rounded-2xl border">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading your domain’s
        current settings…
      </div>
    );
  }

  if (error || !before) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <p className="font-semibold">We could not read your domain’s DNS.</p>
        <p className="mt-1 text-xs leading-5">
          {error ?? "Save your domain first, then come back to this step."}
        </p>
      </div>
    );
  }

  const risk = assessEmailRisk(before);
  const preserve = recordsToPreserve(before);
  const currentHost = identifyDnsHost(before.nameservers);
  const switched = nameserversMatch(
    (after ?? before).nameservers,
    targetNameservers
  );
  const survival = emailSurvivedCutover(before, after);

  // The safety interlock: with email on this domain, the nameserver step
  // stays locked until the agent confirms the records are re-created.
  const emailStepDone = !risk.hasEmail || emailCopied;

  return (
    <div className="space-y-4">
      {risk.warning ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="text-sm font-semibold text-amber-950">
              Read this before you change anything
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-900">
              {risk.warning}
            </p>
          </div>
        </div>
      ) : null}

      <StepShell
        step={1}
        state="done"
        title="We read your current settings"
        description={`${before.domain} is managed by ${currentHost.label} today. Everything below comes from your live domain — you don't need to look anything up.`}
      >
        <div className="mt-3 rounded-xl border bg-slate-50 p-3">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Current nameservers
          </p>
          <ul className="mt-1 space-y-0.5">
            {before.nameservers.length > 0 ? (
              before.nameservers.map((ns) => (
                <li key={ns} className="font-mono text-xs">
                  {ns}
                </li>
              ))
            ) : (
              <li className="text-muted-foreground text-xs">
                None found — the domain may be brand new.
              </li>
            )}
          </ul>
        </div>
      </StepShell>

      <StepShell
        step={2}
        state={emailStepDone ? "done" : "active"}
        title={
          risk.hasEmail
            ? "Copy your email records to the new DNS host"
            : "No email records to move"
        }
        description={
          risk.hasEmail
            ? "Add each row below at your new DNS host exactly as shown, then tick the box. Do this before touching nameservers — these are what keep your email working."
            : "This domain has no mail records, so there is nothing here that could break. Continue to the next step."
        }
      >
        {risk.hasEmail ? (
          <>
            <RecordTable
              records={preserve}
              caption="Recreate every row at the new DNS host. Leave TTL on Auto."
            />
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                checked={emailCopied}
                onChange={(event) => setEmailCopied(event.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                <strong className="block">
                  I have added every row above at my new DNS host
                </strong>
                <span className="text-muted-foreground text-xs">
                  The nameserver step stays locked until this is ticked, so
                  your email cannot break by accident.
                </span>
              </span>
            </label>
          </>
        ) : null}
      </StepShell>

      <StepShell
        step={3}
        state={!emailStepDone ? "locked" : websiteAdded ? "done" : "active"}
        title="Add your website records"
        description="These point your domain at your website. Add them at the same new DNS host."
      >
        {targetWebsiteRecords.length > 0 ? (
          <RecordTable
            records={targetWebsiteRecords}
            caption="Add these at your new DNS host."
          />
        ) : (
          <p className="text-muted-foreground mt-3 rounded-xl border border-dashed p-3 text-sm">
            Your website host will give you one A record or CNAME. Add it at
            the new DNS host, then tick below.
          </p>
        )}
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
          <input
            type="checkbox"
            checked={websiteAdded}
            onChange={(event) => setWebsiteAdded(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <strong className="block">
              My website records are added at the new DNS host
            </strong>
          </span>
        </label>
      </StepShell>

      <StepShell
        step={4}
        state={
          switched ? "done" : emailStepDone && websiteAdded ? "active" : "locked"
        }
        title="Change your nameservers"
        description={
          switched
            ? "Your nameservers are pointing at the new host. This step is complete."
            : `This is the switch itself. Log in where your domain is registered${currentHost.label !== "your current DNS provider" ? ` (${currentHost.label})` : ""}, find "Nameservers", choose custom, and replace what is there with these two.`
        }
      >
        <div className="mt-3 rounded-xl border bg-slate-50 p-3">
          <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
            Set your nameservers to
          </p>
          <ul className="mt-1 space-y-0.5">
            {targetNameservers.map((ns) => (
              <li key={ns} className="font-mono text-xs">
                {ns}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-muted-foreground mt-3 text-xs leading-5">
          Replace the existing nameservers rather than adding to them. The
          change usually takes effect within an hour, but can take up to 48.
          Your website and email keep working the whole time, because you
          copied the records first.
        </p>
        {currentHost.url ? (
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            render={
              <a
                href={currentHost.url}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            Open {currentHost.label}
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        ) : null}
      </StepShell>

      <StepShell
        step={5}
        state={switched && survival.ok ? "done" : switched ? "active" : "locked"}
        title="Check it worked"
        description="Run this after you have changed the nameservers. We re-read your domain and confirm both the website and your email survived."
      >
        <Button
          className="mt-3"
          size="sm"
          onClick={() => void recheck()}
          disabled={rechecking}
        >
          {rechecking ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Check my domain now
        </Button>

        {after ? (
          <div className="mt-3 space-y-2">
            <p className="flex items-start gap-2 text-sm">
              {switched ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Server className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
              )}
              {switched
                ? "Nameservers have moved to the new host."
                : "Nameservers have not changed yet. This can take up to 48 hours — check again later."}
            </p>
            {survival.message ? (
              <p
                className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                  survival.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-rose-300 bg-rose-50 text-rose-900"
                }`}
              >
                {survival.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                {survival.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </StepShell>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Lock,
  XCircle,
} from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { useSubAccount } from "@/context/sub-account-context";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GhlImportHelpDialog } from "@/components/import/ghl-import-help-dialog";
import {
  suggestCustomFields,
  suggestStageMap,
  type GhlCustomFieldDef,
  type GhlPipeline,
  type GhlStageMap,
} from "@/lib/import/ghl/transform";
import type { CustomFieldType } from "@/types/custom-fields";
import type { PipelineStageId } from "@/types/deals";
import type { ImportJob } from "@/types/import";

/**
 * GoHighLevel migration wizard (Phase 4, Slice 5). Connect → preview → map →
 * run. Drives the connect/preview/start routes and streams live progress from
 * the import job doc. Admin-only.
 */

type Step = "connect" | "map" | "run";

interface PreviewData {
  contactTotal: number | null;
  opportunityTotal: number | null;
  pipelines: GhlPipeline[];
  customFields: GhlCustomFieldDef[];
}

interface CfChoice {
  ghlId: string;
  ghlName: string;
  include: boolean;
  label: string;
  type: CustomFieldType;
  entity: "contact" | "deal";
  options: string[];
}

export function GhlImportWizard() {
  const { subAccountId, isAdmin } = useSubAccount();
  const stages = usePipelineStages();

  const [step, setStep] = useState<Step>("connect");
  const [showHelp, setShowHelp] = useState(false);
  const [token, setToken] = useState("");
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [stageMap, setStageMap] = useState<GhlStageMap>({});
  const [defaultStage, setDefaultStage] = useState<PipelineStageId>("new");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [cfChoices, setCfChoices] = useState<CfChoice[]>([]);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);

  // Live job progress.
  useEffect(() => {
    if (!jobId) return;
    return onSnapshot(doc(getFirebaseDb(), "importJobs", jobId), (snap) => {
      if (snap.exists()) setJob({ id: snap.id, ...(snap.data() as Omit<ImportJob, "id">) });
    });
  }, [jobId]);

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-700 dark:text-amber-400">
        Importing is sub-account admin only.
      </div>
    );
  }

  async function connect() {
    if (!token.trim() || !locationId.trim()) {
      toast.error("Paste your Private Integration Token and location id.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/import/ghl/connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token.trim(), locationId: locationId.trim() }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't connect to GoHighLevel.");
        return;
      }
      await loadPreview();
    } catch {
      toast.error("Couldn't connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview() {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/import/ghl/preview`);
    const data = (await res.json().catch(() => ({}))) as PreviewData & {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !data.ok) {
      toast.error(data.error ?? "Couldn't read your GoHighLevel data.");
      return;
    }
    setPreview(data);
    setStageMap(suggestStageMap(data.pipelines ?? []));
    setCfChoices(
      suggestCustomFields(data.customFields ?? []).map((s) => ({
        ghlId: s.ghlId,
        ghlName: s.ghlName,
        include: true,
        label: s.label,
        type: s.type,
        entity: s.entity,
        options: s.options,
      })),
    );
    setStep("map");
  }

  async function startImport() {
    setBusy(true);
    try {
      // Create the LeadStack custom-field defs for the fields being imported,
      // collecting the generated keys for the mapping.
      const customFields: Record<
        string,
        { ghlId: string; ghlName: string; leadstackKey: string }
      > = {};
      for (const c of cfChoices.filter((c) => c.include)) {
        const res = await fetch(`/api/sub-accounts/${subAccountId}/custom-fields`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: c.entity,
            label: c.label,
            type: c.type,
            options: c.options,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          key?: string;
        };
        if (res.ok && data.ok && data.key) {
          customFields[c.ghlId] = {
            ghlId: c.ghlId,
            ghlName: c.ghlName,
            leadstackKey: data.key,
          };
        }
      }

      const res = await fetch(`/api/sub-accounts/${subAccountId}/import/ghl/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping: { stageMap, defaultStage, defaultCurrency, customFields },
          entities: ["contacts", "opportunities", "notes"],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.jobId) {
        toast.error(data.error ?? "Couldn't start the import.");
        return;
      }
      setJobId(data.jobId);
      setJob(null);
      setStep("run");
    } catch {
      toast.error("Couldn't start the import. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  if (step === "connect") {
    return (
      <>
      <Card
        title="Connect GoHighLevel"
        desc="Paste a Private Integration Token from your GHL sub-account (Settings → Private Integrations), plus its location id."
        headerAction={
          <Button variant="ghost" size="sm" onClick={() => setShowHelp(true)}>
            <HelpCircle className="mr-1 h-3.5 w-3.5" />
            How it works
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Private Integration Token">
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="pit-..." />
          </Field>
          <Field label="Location id">
            <Input value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="e.g. abc123…" />
          </Field>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            Your token is stored securely and only used to read your data during the import.
          </p>
          <Button onClick={connect} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Connect &amp; preview
          </Button>
        </div>
      </Card>
      <GhlImportHelpDialog open={showHelp} onOpenChange={setShowHelp} />
      </>
    );
  }

  if (step === "map" && preview) {
    return (
      <Card
        title="Review the mapping"
        desc={`Found ${preview.contactTotal ?? "?"} contacts and ${preview.opportunityTotal ?? "?"} opportunities. Confirm how GoHighLevel stages + fields map into this sub-account.`}
      >
        <div className="space-y-6">
          {/* Stage mapping */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pipeline stages → your stages
            </h3>
            {(preview.pipelines ?? []).map((p) => (
              <div key={p.id} className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">{p.name}</p>
                <div className="space-y-1.5">
                  {p.stages.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <select
                        value={stageMap[s.id] ?? "new"}
                        onChange={(e) =>
                          setStageMap((m) => ({ ...m, [s.id]: e.target.value as PipelineStageId }))
                        }
                        className="h-8 rounded-md border bg-background px-2 text-sm"
                      >
                        {stages.map((cs) => (
                          <option key={cs.id} value={cs.id}>{cs.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Label className="text-xs">Default for unmapped:</Label>
              <select
                value={defaultStage}
                onChange={(e) => setDefaultStage(e.target.value as PipelineStageId)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                {stages.map((cs) => (
                  <option key={cs.id} value={cs.id}>{cs.label}</option>
                ))}
              </select>
              <Label className="text-xs">Currency:</Label>
              <Input
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase().slice(0, 3))}
                className="h-8 w-20"
              />
            </div>
          </section>

          {/* Custom fields */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Custom fields ({cfChoices.filter((c) => c.include).length} to import)
            </h3>
            {cfChoices.length === 0 ? (
              <p className="text-xs text-muted-foreground">No custom fields found.</p>
            ) : (
              <ul className="space-y-1.5">
                {cfChoices.map((c, i) => (
                  <li key={c.ghlId} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={c.include}
                      onChange={(e) =>
                        setCfChoices((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)),
                        )
                      }
                    />
                    <Input
                      value={c.label}
                      onChange={(e) =>
                        setCfChoices((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        )
                      }
                      className="h-8 flex-1"
                    />
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                      {c.entity} · {c.type}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex items-center gap-2">
            <Button onClick={startImport} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Start import
            </Button>
            <Button variant="outline" onClick={() => setStep("connect")} disabled={busy}>
              Back
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // run
  const done = job?.status === "completed" || job?.status === "failed";
  return (
    <Card
      title={done ? "Import finished" : "Importing…"}
      desc={done ? "Here's the summary of what came across." : "Running in the background — you can leave this page; it keeps going."}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {job?.status === "completed" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : job?.status === "failed" ? (
            <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
          <span className="capitalize">{job?.status ?? "starting"}</span>
        </div>

        <div className="space-y-2">
          {(["contacts", "deals", "notes"] as const).map((e) => {
            const t = job?.totals?.[e];
            return (
              <div key={e} className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                <span className="capitalize">{e}</span>
                <span className="text-xs text-muted-foreground">
                  {t
                    ? `${t.created} created · ${t.updated} updated${t.failed ? ` · ${t.failed} failed` : ""}`
                    : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {done && (job?.errors?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <p className="font-medium">{job?.errors.length} record(s) skipped:</p>
            <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
              {job?.errors.slice(0, 20).map((er, i) => (
                <li key={i}>{er.entity} {er.externalId ?? ""}: {er.error}</li>
              ))}
            </ul>
          </div>
        )}

        {done && (
          <Button onClick={() => { setStep("connect"); setJobId(null); setJob(null); }}>
            Done
          </Button>
        )}
      </div>
    </Card>
  );
}

function Card({
  title,
  desc,
  children,
  headerAction,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
          Beta
        </span>
        {headerAction ? <div className="ml-auto">{headerAction}</div> : null}
      </div>
      <p className="mt-0.5 mb-4 text-sm text-muted-foreground">{desc}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

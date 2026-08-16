"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, HeartPulse, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";

interface HealthTask {
  id: string;
  title: string;
  detail: string;
  complete: boolean;
  href: string;
  action: string;
}

interface HealthResult {
  score: number;
  completed: number;
  total: number;
  tasks: HealthTask[];
}

export default function SiteHealthPage() {
  const { subAccountId, saPath } = useSubAccount();
  const [result, setResult] = useState<HealthResult | null>(null);
  const [error, setError] = useState(false);
  const [checkingSite, setCheckingSite] = useState(false);
  const [siteMessage, setSiteMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/sub-accounts/${subAccountId}/site-health`);
    if (!response.ok) throw new Error("health check failed");
    return (await response.json()) as HealthResult;
  }, [subAccountId]);

  /**
   * Ask the server to confirm the agent's own website is live.
   *
   * Runs automatically once when the website task is outstanding, so an
   * agent who already has a site never has to know this check exists — the
   * task simply clears. The server returns a cached verdict when a current
   * one exists, so this does not hit their host on every page view.
   */
  const verifySite = useCallback(
    async (force: boolean) => {
      setCheckingSite(true);
      setSiteMessage(null);
      try {
        const response = await fetch(
          `/api/sub-accounts/${subAccountId}/site-health/verify-site`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force }),
          }
        );
        const data = (await response.json().catch(() => ({}))) as {
          verification?: { status: string; reason: string };
          error?: string;
        };
        if (!response.ok) {
          setSiteMessage(data.error ?? "We could not check your website.");
          return;
        }
        if (data.verification) setSiteMessage(data.verification.reason);
        setResult(await load());
      } catch {
        setSiteMessage("We could not check your website just now.");
      } finally {
        setCheckingSite(false);
      }
    },
    [subAccountId, load]
  );

  useEffect(() => {
    let active = true;
    setError(false);
    void load()
      .then((data) => {
        if (!active) return;
        setResult(data);
        // Zero-touch: if the publish task is outstanding, check whether the
        // agent already has a live site at their saved domain before asking
        // them to build one.
        const websiteTask = data.tasks.find((task) => task.id === "website");
        const domainTask = data.tasks.find((task) => task.id === "domain");
        if (websiteTask && !websiteTask.complete && domainTask?.complete) {
          void verifySite(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [subAccountId, load, verifySite]);

  const remaining = useMemo(
    () => result?.tasks.filter((task) => !task.complete) ?? [],
    [result]
  );

  if (!result && !error) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Checking your site…
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="rounded-2xl border p-8 text-center">
        <p className="font-semibold">We could not check your site right now.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Refresh the page to try again.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      <section className="rounded-2xl bg-[#1b3d7a] p-6 text-white shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-blue-100">
              <HeartPulse className="h-5 w-5" />
              <span className="text-sm font-semibold">Site Health</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold">
              {result.score === 100
                ? "Your site foundation is complete."
                : "Your next steps are ready."}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-blue-100">
              One simple checklist for your website, lead capture, business
              details, and compliance.
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-white/10 px-7 py-5 text-center">
            <div className="text-4xl font-bold">{result.score}%</div>
            <div className="mt-1 text-xs text-blue-100">site health</div>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-emerald-400"
            style={{ width: `${result.score}%` }}
          />
        </div>
      </section>

      <section className="bg-card rounded-2xl border p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">What to finish</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {remaining.length === 0
                ? "Everything on the core checklist is complete."
                : `${remaining.length} ${remaining.length === 1 ? "item" : "items"} left. Start with the first one.`}
            </p>
          </div>
          <span className="text-muted-foreground text-sm tabular-nums">
            {result.completed} of {result.total} done
          </span>
        </div>

        {siteMessage ? (
          <p className="bg-muted/40 text-muted-foreground mt-4 rounded-lg border p-3 text-sm">
            {siteMessage}
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          {result.tasks.map((task, index) => (
            <div
              key={task.id}
              className={`flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${
                task.complete
                  ? "bg-muted/30"
                  : index === result.tasks.findIndex((item) => !item.complete)
                    ? "border-blue-400 bg-blue-50/60 dark:bg-blue-950/20"
                    : ""
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${task.complete ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}
              >
                {task.complete ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`font-medium ${task.complete ? "text-muted-foreground line-through" : ""}`}
                >
                  {task.title}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {task.detail}
                </p>
              </div>
              {task.id === "website" ? (
                /* An agent who already has a site should not be sent to a
                   builder they do not need — offer the check first. */
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {!task.complete ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void verifySite(true)}
                        disabled={checkingSite}
                      >
                        {checkingSite ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        I already have a website
                      </Button>
                      <Button size="sm" render={<Link href={saPath(task.href)} />}>
                        {task.action} <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-emerald-700">
                      Done
                    </span>
                  )}
                </div>
              ) : !task.complete ? (
                <Button size="sm" render={<Link href={saPath(task.href)} />}>
                  {task.action} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <span className="text-sm font-medium text-emerald-700">
                  Done
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

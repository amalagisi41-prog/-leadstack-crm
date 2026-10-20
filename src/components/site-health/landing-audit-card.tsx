"use client";

import { useState } from "react";
import { Loader2, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Severity = "pass" | "warn" | "fail";

interface Finding {
  category: "cta" | "trust" | "contact" | "clarity";
  severity: Severity;
  note: string;
}

interface AuditResult {
  score: number;
  summary: string;
  findings: Finding[];
}

const CATEGORY_LABEL: Record<Finding["category"], string> = {
  cta: "Call to action",
  trust: "Trust signals",
  contact: "Contact info",
  clarity: "Clarity",
};

const SEVERITY_TONE: Record<Severity, string> = {
  pass: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-rose-600 dark:text-rose-400",
};

/**
 * The website.landing-audit skill's entry point. Reads a page's CONTENT —
 * never layout or mobile rendering, which the underlying Firecrawl scrape
 * can't see — for a clear CTA, trust signals, contact info, and message
 * clarity. Lives on Site Health next to the liveness "Verify site" check,
 * which only confirms the page is reachable, not that it converts.
 */
export function LandingAuditCard({
  defaultUrl,
}: {
  defaultUrl: string | null;
}) {
  const { subAccountId } = useSubAccount();
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  async function run() {
    if (!url.trim()) {
      toast.error("Enter a page to audit.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/marketing/landing-audit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        result?: AuditResult;
        error?: string;
      };
      if (!res.ok || !data.result) {
        throw new Error(data.error ?? "Could not audit that page.");
      }
      setResult(data.result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not audit that page.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <ScanSearch className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Audit a landing page</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Reads the page&apos;s content for a clear call to action, trust
            signals, contact info, and message clarity. This checks what the
            page says, not how it looks or renders on mobile.
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourbusiness.com/listings/123-main-st"
          autoComplete="off"
          spellCheck={false}
        />
        <Button onClick={run} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Reading…
            </>
          ) : (
            "Audit"
          )}
        </Button>
      </div>

      {result ? (
        <div className="mt-5 space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight">
              {result.score}
            </span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
          <p className="text-sm">{result.summary}</p>
          <ul className="space-y-2">
            {result.findings.map((f) => (
              <li key={f.category} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 font-medium ${SEVERITY_TONE[f.severity]}`}>
                  {f.severity === "pass" ? "✓" : f.severity === "warn" ? "!" : "✕"}
                </span>
                <span>
                  <span className="font-medium">{CATEGORY_LABEL[f.category]}:</span>{" "}
                  <span className="text-muted-foreground">{f.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

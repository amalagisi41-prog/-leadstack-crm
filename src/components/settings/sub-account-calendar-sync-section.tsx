"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Copy, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";

/**
 * Calendar subscription panel — the .ics feed URL operators paste into
 * Google Calendar / Apple Calendar / Outlook to see their LeadStack
 * bookings alongside other meetings.
 *
 * Read-only subscription, one-way push. External calendar polls our
 * feed endpoint on its own cadence (Google: 8-24h). Updates appear
 * eventually — this is NOT real-time sync; that's the v1.1 OAuth
 * upgrade path.
 *
 * Visible to every active sub-account member (not admin-only). Two feeds:
 *   - "All bookings" — the shared per-sub-account feed (every booking).
 *   - "Just my bookings" — only events assigned to the current member
 *     (useful for team / round-robin booking pages). Server-scoped to the
 *     caller's own uid; see the calendar-feed-url route.
 */
export function SubAccountCalendarSyncSection() {
  const { subAccountId } = useSubAccount();
  const [url, setUrl] = useState<string | null>(null);
  const [hostUrl, setHostUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/sub-accounts/${subAccountId}/calendar-feed-url`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          hostUrl?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.url) {
          setError(data.error ?? "Couldn't load the calendar feed URL.");
        } else {
          setUrl(data.url);
          setHostUrl(data.hostUrl ?? null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Network error.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Calendar URL copied.");
    } catch {
      toast.error("Clipboard blocked — select the URL and copy manually.");
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <CalendarCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Calendar sync</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Subscribe to this sub-account&apos;s bookings from your
            external calendar so they appear alongside your other
            meetings.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border bg-background p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Generating your calendar URL…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-700 dark:text-rose-400">
          {error}
        </div>
      ) : url ? (
        <>
          <div className="space-y-3">
            <FeedUrlRow
              label="All bookings"
              hint="Everyone's bookings in this sub-account — the shared team calendar."
              url={url}
              onCopy={() => copyText(url)}
            />
            {hostUrl && (
              <FeedUrlRow
                label="Just my bookings"
                hint="Only bookings assigned to you — useful when a page runs as a team (round-robin)."
                url={hostUrl}
                onCopy={() => copyText(hostUrl)}
              />
            )}
          </div>

          <div className="mt-5 space-y-4">
            <Steps
              title="Google Calendar"
              steps={[
                <>
                  Open{" "}
                  <a
                    href="https://calendar.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    calendar.google.com
                  </a>
                  .
                </>,
                <>
                  In the left sidebar, click <strong>+</strong> next to{" "}
                  <strong>Other calendars</strong> → <strong>From URL</strong>.
                </>,
                <>
                  Paste the URL above into the field, then click{" "}
                  <strong>Add calendar</strong>.
                </>,
                <>
                  Your LeadStack bookings appear within a few hours. Google
                  polls subscribed calendars on its own schedule (typically
                  8&ndash;24 hours).
                </>,
              ]}
            />
            <Steps
              title="Apple Calendar"
              steps={[
                <>
                  Open <strong>Calendar</strong> on Mac.
                </>,
                <>
                  Menu: <strong>File</strong> →{" "}
                  <strong>New Calendar Subscription…</strong>
                </>,
                <>Paste the URL → set Auto-refresh to Every hour.</>,
              ]}
            />
            <Steps
              title="Outlook on the web"
              steps={[
                <>
                  Open <strong>Outlook Calendar</strong> →{" "}
                  <strong>Add calendar</strong> →{" "}
                  <strong>Subscribe from web</strong>.
                </>,
                <>
                  Paste the URL → give it a name → click{" "}
                  <strong>Import</strong>.
                </>,
              ]}
            />
          </div>

          <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
            The feed is read-only — your external calendar receives our
            bookings but can&apos;t edit them. To keep events private, treat
            this URL like a password. If it leaks, rotate{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
              AUTOMATIONS_TOKEN_SECRET
            </code>{" "}
            on the deployment (invalidates every feed URL across the
            agency).
          </p>
        </>
      ) : null}
    </section>
  );
}

function FeedUrlRow({
  label,
  hint,
  url,
  onCopy,
}: {
  label: string;
  hint: string;
  url: string;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold">{label}</p>
      <div className="flex items-center gap-2 rounded-md border bg-background p-2 font-mono text-xs">
        <code className="min-w-0 flex-1 truncate">{url}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCopy}
          className="shrink-0"
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Steps({
  title,
  steps,
}: {
  title: string;
  steps: React.ReactNode[];
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ol className="ml-4 list-decimal space-y-1 text-xs leading-relaxed">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

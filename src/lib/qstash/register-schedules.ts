import "server-only";

import { Client } from "@upstash/qstash";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Auto-register the LeadStack daily cron schedules on cold start.
 *
 * Removes the manual "click into the QStash dashboard, create a
 * schedule" step from buyer onboarding. The buyer sets QStash env vars
 * and the schedules appear on the next cold start.
 *
 * Idempotent via stable `scheduleId`s — QStash treats a `create()` with
 * an existing id as a replace, so calling on every cold start is safe.
 *
 * Cost reduction:
 *   - A 24-hour Firestore marker (`system/scheduleRegistration`) caches
 *     "we registered already" so the steady-state cold start drops to a
 *     single Firestore read (~10ms) instead of 2 QStash API calls
 *     (~200ms). The marker also stores the `baseUrl` it registered
 *     against, so a redeploy that changes `NEXT_PUBLIC_APP_URL` blows
 *     the cache and re-registers immediately.
 *
 * Failure mode:
 *   - QStash down / network failure: log + skip. The next cold start
 *     retries. Schedules that already exist in QStash continue running.
 *   - Marker doc write fails: log + skip. Worst case we re-register on
 *     the next cold start instead of using the cache. No correctness
 *     impact.
 *
 * To add a new schedule: append to `SCHEDULES`. Stable scheduleId is
 * required (no random ids — that's how you end up with duplicates).
 */

interface ScheduleSpec {
  scheduleId: string;
  path: string;
  cron: string;
  description: string;
}

const SCHEDULES: ScheduleSpec[] = [
  {
    scheduleId: "leadstack-gitpage-heartbeat",
    path: "/api/cron/gitpage-heartbeat",
    cron: "0 3 * * *",
    description: "Daily gitpage telemetry + subscription status cache.",
  },
  {
    scheduleId: "leadstack-api-cleanup",
    path: "/api/cron/api-cleanup",
    cron: "0 4 * * *",
    description:
      "Daily sweep of expired apiRequestLogs / apiIdempotency / webhookEvents.",
  },
];

const MARKER_PATH = "system/scheduleRegistration";
const SKIP_AGE_MS = 24 * 60 * 60 * 1000;

function tsToDate(ts: Timestamp | Date | null | undefined): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof (ts as Timestamp).toDate === "function") {
    return (ts as Timestamp).toDate();
  }
  return null;
}

export async function ensureSchedulesRegistered(): Promise<void> {
  // Gate: no QStash credentials → nothing to register. Local dev without
  // a tunnel falls into this path; that's correct.
  if (!process.env.QSTASH_TOKEN) return;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) return;
  // Skip in non-production runtimes where re-registering across hot reloads
  // would just churn QStash. Local production builds (`pnpm build && pnpm
  // start`) still register so buyers can test the full flow locally.
  if (process.env.NODE_ENV !== "production") return;

  const db = getAdminDb();
  const markerRef = db.doc(MARKER_PATH);

  // 24h cache check. Skip the QStash round-trip on hot cold-starts.
  try {
    const snap = await markerRef.get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      const lastUrl = data.baseUrl as string | undefined;
      const lastAt = tsToDate(data.registeredAt);
      if (
        lastUrl === baseUrl &&
        lastAt &&
        Date.now() - lastAt.getTime() < SKIP_AGE_MS
      ) {
        return;
      }
    }
  } catch (err) {
    // Marker read failures aren't fatal — fall through and re-register.
    console.warn("[schedules] marker read failed; will re-register", err);
  }

  const client = new Client({
    token: process.env.QSTASH_TOKEN,
    ...(process.env.QSTASH_URL ? { baseUrl: process.env.QSTASH_URL } : {}),
  });

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const s of SCHEDULES) {
    try {
      await client.schedules.create({
        scheduleId: s.scheduleId,
        destination: `${baseUrl}${s.path}`,
        cron: s.cron,
      });
      results.push({ id: s.scheduleId, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      console.warn(
        `[schedules] failed to register ${s.scheduleId}: ${message}`,
      );
      results.push({ id: s.scheduleId, ok: false, error: message });
    }
  }

  // Update marker even on partial failure so cold starts don't pound
  // QStash. A 24-hour delay before the next attempt is acceptable — a
  // schedule that failed once isn't expected to succeed on the next cold
  // start a minute later.
  try {
    await markerRef.set(
      {
        baseUrl,
        registeredAt: FieldValue.serverTimestamp(),
        scheduleIds: SCHEDULES.map((s) => s.scheduleId),
        lastResults: results,
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("[schedules] marker write failed", err);
  }
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_REVIEW_AUTOMATION_MODE,
  DEFAULT_REVIEW_DELAY_DAYS,
  MAX_REVIEW_DELAY_DAYS,
  type ReviewAutomationMode,
} from "@/types/review-requests";
import type { GoogleReviewConfig } from "@/types/tenancy";

const MODES: { value: ReviewAutomationMode; label: string; body: string }[] = [
  { value: "off", label: "Off", body: "Nothing happens when a deal closes." },
  {
    value: "log_only",
    label: "Log only",
    body: "Each closed deal creates a request, waits the delay, and records exactly what would happen. Nothing is sent.",
  },
  {
    value: "live",
    label: "Live",
    body: "Same flow, and the review request is really sent at the scheduled time.",
  },
];

/**
 * The post-closing review automation: Off / Log only / Live, plus the
 * days-after-closing delay. Admins edit; everyone else reads.
 */
export function ReviewAutomationCard({
  subAccountId,
  config,
  canEdit,
  settingsHref,
}: {
  subAccountId: string;
  config: GoogleReviewConfig | null | undefined;
  canEdit: boolean;
  settingsHref: string;
}) {
  const mode: ReviewAutomationMode = config?.automationMode ?? DEFAULT_REVIEW_AUTOMATION_MODE;
  const savedDelay = config?.delayDaysAfterClosing ?? DEFAULT_REVIEW_DELAY_DAYS;
  const [delay, setDelay] = useState(String(savedDelay));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDelay(String(savedDelay)), [savedDelay]);

  async function save(patch: { mode?: ReviewAutomationMode; delayDaysAfterClosing?: number }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/review-requests/automation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      toast.success("Review automation saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function chooseMode(next: ReviewAutomationMode) {
    if (next === mode) return;
    if (
      next === "live" &&
      !window.confirm(
        "Switch to Live? Review requests will really be sent to clients when their delay is up — including requests already queued.",
      )
    ) {
      return;
    }
    void save({ mode: next });
  }

  const delayNum = Number(delay);
  const delayValid = Number.isInteger(delayNum) && delayNum >= 0 && delayNum <= MAX_REVIEW_DELAY_DAYS;
  const linkSet = !!config?.reviewUrl;

  return (
    <section className="bg-card space-y-4 rounded-2xl border p-5" data-testid="review-automation">
      <div>
        <h2 className="text-sm font-semibold">Post-closing automation</h2>
        <p className="text-muted-foreground text-xs">
          When a deal reaches Closed (won), a review request is created for its contact and goes
          out {savedDelay === 0 ? "right away" : `${savedDelay} day${savedDelay === 1 ? "" : "s"} later`}.
        </p>
      </div>

      <div role="radiogroup" aria-label="Automation mode" className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            disabled={!canEdit || saving}
            onClick={() => chooseMode(m.value)}
            className={`rounded-lg border p-3 text-left text-sm disabled:cursor-not-allowed ${
              mode === m.value ? "border-primary bg-primary/5" : "hover:bg-muted/40"
            }`}
          >
            <span className="font-medium">{m.label}</span>
            <span className="text-muted-foreground mt-1 block text-xs">{m.body}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="review-delay">Days after closing</Label>
          <Input
            id="review-delay"
            type="number"
            min={0}
            max={MAX_REVIEW_DELAY_DAYS}
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            disabled={!canEdit || saving}
            className="w-28"
          />
        </div>
        {canEdit ? (
          <Button
            variant="outline"
            disabled={saving || !delayValid || delayNum === savedDelay}
            onClick={() => save({ delayDaysAfterClosing: delayNum })}
          >
            Save delay
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">An admin on this workspace can change this.</p>
        )}
        {!delayValid ? (
          <p className="text-xs text-red-600">Enter a whole number from 0 to {MAX_REVIEW_DELAY_DAYS}.</p>
        ) : null}
      </div>

      <p className="text-xs">
        <span className="font-medium">Review link: </span>
        {linkSet ? (
          <span className="text-emerald-700 dark:text-emerald-400">set up</span>
        ) : (
          <>
            <span className="text-amber-700 dark:text-amber-400">not set up yet</span> — requests will
            fail until you add it.{" "}
          </>
        )}{" "}
        <Link href={settingsHref} className="text-primary underline underline-offset-2">
          {linkSet ? "Edit link and channel" : "Set up your Google review link"}
        </Link>
      </p>
    </section>
  );
}

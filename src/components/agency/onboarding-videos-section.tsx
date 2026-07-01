"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Eye, EyeOff, PlayCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import {
  ONBOARDING_STEPS,
  type OnboardingStepId,
  type OnboardingVideos,
} from "@/lib/onboarding/steps";

const URL_RE = /^https?:\/\/.+/i;

export function OnboardingVideosSection() {
  const agency = useAgency();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once from the agency doc; don't clobber in-flight edits on the
  // snapshot tick that fires from the operator's own save.
  useEffect(() => {
    if (!agency.loading && !hydrated) {
      const seed: Record<string, string> = {};
      for (const step of ONBOARDING_STEPS) {
        seed[step.id] = agency.onboardingVideos[step.id] ?? "";
      }
      setUrls(seed);
      setHydrated(true);
    }
  }, [agency.loading, agency.onboardingVideos, hydrated]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();

    // Validate every non-empty field before sending.
    const payload: OnboardingVideos = {};
    for (const step of ONBOARDING_STEPS) {
      const val = (urls[step.id] ?? "").trim();
      if (!val) continue;
      if (!URL_RE.test(val)) {
        toast.error(`"${step.title}" video URL must start with http:// or https://.`);
        return;
      }
      payload[step.id] = val;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/agency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingVideos: payload }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      toast.success("Onboarding videos saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  const filledCount = ONBOARDING_STEPS.filter((s) =>
    (urls[s.id] ?? "").trim(),
  ).length;

  // Feed the preview only valid http(s) URLs so a half-typed link doesn't
  // render a broken "Watch" button — this mirrors exactly what will save.
  const previewVideos = useMemo<OnboardingVideos>(() => {
    const out: OnboardingVideos = {};
    for (const step of ONBOARDING_STEPS) {
      const val = (urls[step.id] ?? "").trim();
      if (val && URL_RE.test(val)) out[step.id as OnboardingStepId] = val;
    }
    return out;
  }, [urls]);

  return (
    <form
      onSubmit={handleSave}
      className="space-y-5 rounded-2xl border bg-card p-5"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <PlayCircle className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Onboarding videos</h2>
          <p className="text-xs text-muted-foreground">
            Paste a walkthrough URL (Loom, YouTube, Vimeo — any link) for each
            setup step. New sub-accounts see a &ldquo;Watch&rdquo; button on the
            dashboard checklist for every step you fill in. Leave a field blank
            to hide that step&apos;s button.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {ONBOARDING_STEPS.map((step, i) => (
          <div key={step.id} className="space-y-1.5">
            <Label htmlFor={`video-${step.id}`} className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              {step.title}
              <span className="text-[11px] font-normal text-muted-foreground">
                (~{step.videoMinutes} min)
              </span>
            </Label>
            <Input
              id={`video-${step.id}`}
              type="url"
              value={urls[step.id] ?? ""}
              onChange={(e) =>
                setUrls((prev) => ({ ...prev, [step.id]: e.target.value }))
              }
              placeholder="https://www.loom.com/share/…"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          {filledCount} of {ONBOARDING_STEPS.length} videos added
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? (
              <EyeOff className="mr-1 h-3.5 w-3.5" />
            ) : (
              <Eye className="mr-1 h-3.5 w-3.5" />
            )}
            {showPreview ? "Hide preview" : "Preview checklist"}
          </Button>
          <Button type="submit" disabled={saving || !hydrated}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {showPreview && (
        <div className="rounded-2xl border bg-muted/30 p-4">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            What new agents see · updates live as you type
          </p>
          <OnboardingChecklist preview videosOverride={previewVideos} />
        </div>
      )}
    </form>
  );
}

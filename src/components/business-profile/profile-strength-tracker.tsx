"use client";

import { CheckCircle2, Circle, TrendingUp } from "lucide-react";
import type { BusinessProfileContent } from "@/types/business-profile";

interface ProfileStrengthTrackerProps {
  profile: Partial<BusinessProfileContent>;
  completeness: number;
}

export function ProfileStrengthTracker({
  profile,
  completeness,
}: ProfileStrengthTrackerProps) {
  const strengthLevel = completeness >= 100 ? "Complete" : completeness >= 75 ? "Strong" : completeness >= 50 ? "Good" : "Getting started";

  const fields = [
    { key: "agentName", label: "Your name", icon: "👤" },
    { key: "phone", label: "Phone number", icon: "📞" },
    { key: "email", label: "Email", icon: "✉️" },
    { key: "website", label: "Website", icon: "🌐" },
    { key: "brokerage", label: "Brokerage", icon: "🏢" },
    { key: "serviceAreas", label: "Service areas", icon: "📍" },
    { key: "businessHours", label: "Business hours", icon: "⏰" },
    { key: "bio", label: "Bio/Description", icon: "📝" },
    { key: "headshotUrl", label: "Photo", icon: "📸" },
  ] as const;

  const filledFields = fields.filter(
    (f) => profile[f.key as keyof typeof profile]
  ).length;

  return (
    <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100/50 p-4 dark:border-slate-700 dark:from-slate-950 dark:to-slate-900/50">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
            Profile Strength
          </h3>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {completeness}%
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {strengthLevel}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
          style={{ width: `${Math.min(completeness, 100)}%` }}
        />
      </div>

      {/* Completed fields */}
      <div className="mb-3 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-medium">{filledFields}</span> of <span className="font-medium">{fields.length}</span> fields completed
      </div>

      {/* Field checklist */}
      <div className="space-y-2">
        {fields.map((field) => {
          const isFilled = Boolean(profile[field.key as keyof typeof profile]);
          return (
            <div
              key={field.key}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors"
            >
              {isFilled ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-600" />
              )}
              <span className={isFilled ? "text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-400"}>
                {field.icon} {field.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Goal message */}
      {completeness < 100 && (
        <div className="mt-4 rounded-lg bg-white/50 p-2 text-xs text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
          <p className="font-medium mb-1">🎯 Your goal: 100% complete</p>
          <p>Every field you complete helps leads find and trust you. Keep going!</p>
        </div>
      )}

      {completeness === 100 && (
        <div className="mt-4 rounded-lg bg-green-50/50 p-2 text-xs text-green-700 dark:bg-green-950/30 dark:text-green-300">
          <p className="font-medium">✨ Profile complete!</p>
          <p>Your profile is fully set up. Share your AgentStack link to start getting leads.</p>
        </div>
      )}
    </div>
  );
}

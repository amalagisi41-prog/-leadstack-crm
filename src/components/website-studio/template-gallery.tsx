"use client";

import { AGENT_SITE_TEMPLATE_LIST } from "@/lib/website-studio/templates";
import type { AgentSiteTemplateId } from "@/types/agent-site";

/**
 * Premium template picker. Each card previews the template's palette + type
 * treatment so the agent chooses by feel before the Designer interview.
 */
export function TemplateGallery({
  onSelect,
  selecting,
}: {
  onSelect: (id: AgentSiteTemplateId) => void;
  selecting: AgentSiteTemplateId | null;
}) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Choose your design</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a premium template to start. Our AI Designer will then walk you
          through building your site step by step — you can switch templates
          any time without losing your content.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {AGENT_SITE_TEMPLATE_LIST.map((t) => {
          const p = t.palette;
          const busy = selecting === t.id;
          return (
            <button
              key={t.id}
              disabled={!!selecting}
              onClick={() => onSelect(t.id)}
              className="group overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
            >
              {/* Palette preview */}
              <div
                className="relative flex h-40 flex-col justify-between p-4"
                style={{ background: p.bg, color: p.text }}
              >
                <div
                  className="text-lg font-semibold"
                  style={{ fontFamily: t.fontDisplay }}
                >
                  {t.name}
                </div>
                <div>
                  <div
                    className="mb-2 inline-block rounded px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: p.accent, color: p.accentText, borderRadius: t.radius }}
                  >
                    Get in touch
                  </div>
                  <div className="flex gap-1.5">
                    {[p.accent, p.surface, p.muted, p.border].map((c, i) => (
                      <span
                        key={i}
                        className="h-4 w-4 rounded-full border"
                        style={{ background: c, borderColor: p.border }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {t.heroVariant} hero
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>
                <p className="mt-2 text-xs font-medium text-blue-600">
                  {t.bestFor}
                </p>
                <span className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-[#1a2f50] px-3 py-2 text-sm font-medium text-white transition-colors group-hover:bg-[#243d66]">
                  {busy ? "Setting up…" : `Start with ${t.name}`}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

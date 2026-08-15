"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AgentSiteComposition } from "@/types/agent-site";
import {
  AGENT_SITE_REQUIRED_SECTIONS,
  AGENT_SITE_SECTION_LABELS,
  normalizeAgentSiteComposition,
} from "@/lib/website-studio/site-composition";

export function SiteStructureEditor({
  composition,
  onChange,
  onSave,
  saving,
}: {
  composition?: AgentSiteComposition;
  onChange: (composition: AgentSiteComposition) => void;
  onSave: (composition: AgentSiteComposition) => Promise<void>;
  saving: boolean;
}) {
  const [local, setLocal] = useState(() =>
    normalizeAgentSiteComposition(composition)
  );

  useEffect(() => {
    setLocal(normalizeAgentSiteComposition(composition));
  }, [composition]);

  function update(next: AgentSiteComposition) {
    const normalized = normalizeAgentSiteComposition(next);
    setLocal(normalized);
    onChange(normalized);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= local.sections.length) return;
    const sections = [...local.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    update({ ...local, sections });
  }

  function toggle(index: number) {
    const section = local.sections[index];
    if (AGENT_SITE_REQUIRED_SECTIONS.has(section.type)) return;
    update({
      ...local,
      sections: local.sections.map((item, itemIndex) =>
        itemIndex === index ? { ...item, visible: !item.visible } : item
      ),
    });
  }

  return (
    <div className="bg-card flex h-full flex-col rounded-2xl border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Page structure</p>
          <p className="text-muted-foreground text-[11px]">
            Order sections and hide optional content.
          </p>
        </div>
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            try {
              await onSave(local);
              toast.success("Page structure saved.");
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Could not save page structure."
              );
            }
          }}
        >
          <Save className="mr-1 h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950">
          Header, hero, contact, and compliance footer stay on so every site has
          a clear path to convert and the required business identity.
        </div>
        {local.sections.map((section, index) => {
          const required = AGENT_SITE_REQUIRED_SECTIONS.has(section.type);
          return (
            <div
              key={section.id}
              className={`flex items-center gap-2 rounded-xl border p-2.5 ${
                section.visible ? "bg-background" : "bg-muted/50 opacity-70"
              }`}
            >
              <GripVertical className="text-muted-foreground h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {AGENT_SITE_SECTION_LABELS[section.type]}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  {required
                    ? "Required"
                    : section.visible
                      ? "Visible"
                      : "Hidden"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${AGENT_SITE_SECTION_LABELS[section.type]} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${AGENT_SITE_SECTION_LABELS[section.type]} down`}
                  disabled={index === local.sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`${section.visible ? "Hide" : "Show"} ${AGENT_SITE_SECTION_LABELS[section.type]}`}
                  disabled={required}
                  onClick={() => toggle(index)}
                >
                  {section.visible ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CAPABILITY_ORDER,
  resolveCapabilities,
  type CapabilityInputs,
} from "@/lib/website-studio/prompt-library/capabilities";
import { composeTemplateBrief } from "@/lib/website-studio/prompt-library/compose";
import { SITE_TEMPLATES } from "@/lib/website-studio/prompt-library/templates";

/**
 * Starting points, with what each one can actually build on this account.
 *
 * The whole point is what happens *before* the button: an agent sees, in
 * advance, that the listings section will not be built and why, with a link to
 * fix it. The alternative — generate first, discover the empty grid after — is
 * the failure this feature exists to avoid, and it is worse than a blank page
 * because the agent has already been charged for the run and the page looks
 * finished enough to publish.
 *
 * Nothing here decides anything on its own. `composeTemplateBrief` owns the
 * rules; this renders them.
 */
export function TemplateBriefPicker({
  capabilities,
  saPath,
  onUseBrief,
}: {
  capabilities: CapabilityInputs;
  /** Prefixes a sub-account-relative href. */
  saPath: (path: string) => string;
  /** Hands the composed brief to the designer chat. */
  onUseBrief: (brief: string, templateName: string) => void;
}) {
  const resolved = useMemo(
    () => resolveCapabilities(capabilities),
    [capabilities]
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#173B7A]">
          <Sparkles className="h-4 w-4" />
          Start from a proven brief
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Each one is written for a specific kind of agent. We check what is
          connected on your account first, so nothing gets built that we cannot
          fill with your real information.
        </p>
      </div>

      {SITE_TEMPLATES.map((template) => {
        const brief = composeTemplateBrief(template, resolved);
        const blocked = brief.blockedBy.length > 0;

        return (
          // Labelled so each card is its own navigable region. With nine
          // starting points on the page, an unlabelled list of articles gives
          // a screen-reader user no way to tell which one they are inside.
          <article
            key={template.id}
            aria-label={template.name}
            className="rounded-2xl border bg-white p-5"
          >
            <h3 className="font-semibold">{template.name}</h3>
            <p className="text-muted-foreground text-xs">{template.audience}</p>
            <p className="mt-2 text-sm leading-6">{template.summary}</p>

            {/* Readiness, stated before anything runs. */}
            <ul className="mt-4 space-y-2">
              {CAPABILITY_ORDER.filter((id) =>
                template.requires.some((r) => r.capability === id)
              ).map((id) => {
                const cap = resolved[id];
                const omitted = brief.omitted.find((o) => o.capability === id);
                const blocking = brief.blockedBy.some((c) => c.id === id);

                return (
                  <li
                    key={id}
                    className="flex flex-wrap items-start gap-2 text-sm"
                  >
                    {cap.available ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          blocking ? "text-rose-600" : "text-amber-600"
                        }`}
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{cap.label}</span>
                      {cap.available ? null : (
                        <span className="text-muted-foreground block text-xs leading-5">
                          {cap.detail}
                          {omitted ? (
                            <>
                              {" "}
                              The <strong>{omitted.section}</strong> section will
                              be left out.
                            </>
                          ) : null}
                        </span>
                      )}
                    </span>
                    {cap.available ? null : (
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={saPath(cap.href)} />}
                      >
                        {cap.action}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                disabled={blocked}
                onClick={() => onUseBrief(brief.prompt, template.name)}
                className="bg-[#173B7A] text-white hover:bg-[#244c8e]"
              >
                {blocked
                  ? "Add your details first"
                  : brief.omitted.length > 0
                    ? "Build without the missing parts"
                    : "Build this site"}
              </Button>
              {blocked ? (
                <p className="text-xs leading-5 text-rose-800">
                  {brief.blockedBy[0].detail}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  You can edit everything afterwards — nothing publishes on its
                  own.
                </p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

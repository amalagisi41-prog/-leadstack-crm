"use client";

import { useMemo } from "react";
import { Puck, type Config, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import type { AgentSiteComposition } from "@/types/agent-site";
import {
  compositionToPuckData,
  puckDataToComposition,
} from "@/lib/website-studio/puck-adapter";
import { REALTOR_COMPONENT_BY_SECTION } from "@/lib/website-studio/realtor-component-registry";

type SectionBlockProps = { label: string; description: string };
type RealtorComponents = {
  SiteHeader: SectionBlockProps;
  Hero: SectionBlockProps;
  About: SectionBlockProps;
  Specialties: SectionBlockProps;
  IdxListings: SectionBlockProps;
  FeaturedListings: SectionBlockProps;
  Testimonials: SectionBlockProps;
  ContactCta: SectionBlockProps;
  SiteFooter: SectionBlockProps;
};

function SectionBlock({ label, description }: SectionBlockProps) {
  return (
    <section className="border-border bg-background my-2 rounded-xl border p-5 shadow-sm">
      <div className="text-foreground text-sm font-semibold">{label}</div>
      <p className="text-muted-foreground mt-1 text-xs">{description}</p>
    </section>
  );
}

const section = (label: string, description: string, required = false) => ({
  defaultProps: { label, description },
  fields: {
    label: { type: "text" as const },
    description: { type: "textarea" as const },
  },
  render: SectionBlock,
  resolvePermissions: () =>
    required ? { delete: false, duplicate: false } : { duplicate: false },
});

const registeredSection = (id: keyof typeof REALTOR_COMPONENT_BY_SECTION) => {
  const component = REALTOR_COMPONENT_BY_SECTION[id];
  return section(component.label, component.description, component.required);
};

const realtorConfig: Config<RealtorComponents> = {
  categories: {
    essentials: {
      title: "Real estate essentials",
      defaultExpanded: true,
      components: ["Hero", "About", "Specialties", "ContactCta"],
    },
    property: {
      title: "Properties & proof",
      defaultExpanded: true,
      components: ["IdxListings", "FeaturedListings", "Testimonials"],
    },
    site: {
      title: "Site framework",
      components: ["SiteHeader", "SiteFooter"],
    },
  },
  components: {
    SiteHeader: registeredSection("header"),
    Hero: registeredSection("hero"),
    About: registeredSection("about"),
    Specialties: registeredSection("specialties"),
    IdxListings: registeredSection("idx"),
    FeaturedListings: registeredSection("listings"),
    Testimonials: registeredSection("testimonials"),
    ContactCta: registeredSection("cta"),
    SiteFooter: registeredSection("footer"),
  },
};

export function PuckAgentSiteEditor({
  composition,
  onChange,
  onSave,
}: {
  composition: AgentSiteComposition;
  onChange: (composition: AgentSiteComposition) => void;
  onSave: (composition: AgentSiteComposition) => Promise<void> | void;
}) {
  const data = useMemo(() => compositionToPuckData(composition), [composition]);

  const updateComposition = (next: Data) => {
    onChange(puckDataToComposition(next, composition));
  };

  return (
    <div className="h-[72vh] overflow-hidden rounded-2xl border">
      <Puck
        config={realtorConfig}
        data={data}
        headerTitle="AgentStack Visual Builder"
        headerPath="Website Studio / Puck + Zack"
        onChange={updateComposition}
        renderHeaderActions={({ state }) => (
          <button
            type="button"
            onClick={() => {
              const normalized = puckDataToComposition(state.data, composition);
              onChange(normalized);
              void onSave(normalized);
            }}
            className="rounded-md bg-[#1a2f50] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#294a78]"
          >
            Save layout
          </button>
        )}
        permissions={{ duplicate: false }}
        viewports={[
          { width: 390, height: "auto", label: "Mobile", icon: "Smartphone" },
          { width: 1280, height: "auto", label: "Desktop", icon: "Monitor" },
        ]}
      />
    </div>
  );
}

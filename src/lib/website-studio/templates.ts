import type { AgentSiteTemplateId } from "@/types/agent-site";

/**
 * Premium white-label agent-website templates — curated + archived here.
 *
 * A template is a set of DESIGN TOKENS (palette, fonts, hero style) plus
 * metadata. One renderer (components/website-studio/agent-site-renderer.tsx)
 * applies these tokens, so three token sets yield three distinct premium
 * looks without three separate layouts. Add a template by adding an entry
 * here + extending AgentSiteTemplateId.
 */

export type HeroVariant = "overlay" | "split" | "centered";

export interface TemplatePalette {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  border: string;
}

export interface AgentSiteTemplate {
  id: AgentSiteTemplateId;
  name: string;
  /** One-line pitch shown in the gallery. */
  tagline: string;
  /** Who it suits — helps the agent choose. */
  bestFor: string;
  heroVariant: HeroVariant;
  palette: TemplatePalette;
  /** CSS font-family stacks. Uses fonts already loaded app-wide + fallbacks. */
  fontDisplay: string;
  fontBody: string;
  /** Corner radius applied to cards/images, in px. */
  radius: number;
  /** Uppercase + wide-tracked section eyebrows? (editorial vs modern) */
  uppercaseEyebrows: boolean;
}

const SANS = "var(--font-geist-sans), system-ui, -apple-system, sans-serif";
const SERIF = "var(--font-instrument-serif), Georgia, 'Times New Roman', serif";

export const AGENT_SITE_TEMPLATES: Record<AgentSiteTemplateId, AgentSiteTemplate> = {
  luxe: {
    id: "luxe",
    name: "Luxe",
    tagline: "Dark, editorial, and unmistakably high-end.",
    bestFor: "Luxury & high-end residential specialists",
    heroVariant: "overlay",
    palette: {
      bg: "#0f0f10",
      surface: "#18181b",
      text: "#f5f2ec",
      muted: "#a8a29e",
      accent: "#c8a35b", // champagne gold
      accentText: "#0f0f10",
      border: "#2a2a2e",
    },
    fontDisplay: SERIF,
    fontBody: SANS,
    radius: 4,
    uppercaseEyebrows: true,
  },
  coastal: {
    id: "coastal",
    name: "Coastal",
    tagline: "Light, airy, and effortlessly modern.",
    bestFor: "Suburban, waterfront & lifestyle agents",
    heroVariant: "split",
    palette: {
      bg: "#f8fafb",
      surface: "#ffffff",
      text: "#0f2a33",
      muted: "#5b7480",
      accent: "#2f9e9e", // teal
      accentText: "#ffffff",
      border: "#e2ebee",
    },
    fontDisplay: SANS,
    fontBody: SANS,
    radius: 18,
    uppercaseEyebrows: false,
  },
  metro: {
    id: "metro",
    name: "Metro",
    tagline: "Bold, confident, and built to convert.",
    bestFor: "Urban, high-volume & team producers",
    heroVariant: "centered",
    palette: {
      bg: "#ffffff",
      surface: "#f4f5f7",
      text: "#12172a",
      muted: "#5a6072",
      accent: "#ff5a1f", // vivid orange
      accentText: "#ffffff",
      border: "#e4e6ec",
    },
    fontDisplay: SANS,
    fontBody: SANS,
    radius: 10,
    uppercaseEyebrows: true,
  },
};

export const AGENT_SITE_TEMPLATE_LIST: AgentSiteTemplate[] =
  Object.values(AGENT_SITE_TEMPLATES);

export function getTemplate(id: AgentSiteTemplateId): AgentSiteTemplate {
  return AGENT_SITE_TEMPLATES[id] ?? AGENT_SITE_TEMPLATES.coastal;
}

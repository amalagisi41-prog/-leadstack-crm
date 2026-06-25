/**
 * Curated value lists for gitpage's `POST /api/v1/generate-site` request
 * (with `buildType: "local"`).
 *
 * gitpage silently falls back to defaults when it receives an unrecognised
 * value — which would mean form submissions look like they did nothing.
 * The form uses these arrays as the source of truth for dropdowns;
 * validation rejects anything not in the list.
 *
 * Source: https://www.gitpage.site integration spec §4.5.
 */

export const GITPAGE_LANGUAGES = [
  "English",
  "Spanish (Español)",
  "French (Français)",
  "German (Deutsch)",
  "Italian (Italiano)",
  "Portuguese (Português)",
  "Dutch (Nederlands)",
  "Polish (Polski)",
  "Czech (Čeština)",
  "Romanian (Română)",
  "Swedish (Svenska)",
  "Indonesian (Bahasa Indonesia)",
] as const;

export const GITPAGE_COLOR_SCHEMES = ["Standard", "Dark Mode"] as const;

export const GITPAGE_DESIGN_COLOR_PALETTES = [
  "Modern / Startup",
  "Minimal / Clean",
  "Bold / Creative",
  "Custom",
] as const;

export const GITPAGE_DESIGN_TYPOGRAPHY = [
  "Professional / Corporate",
  "Friendly / Soft",
  "Tech / Futuristic",
] as const;

export const GITPAGE_DESIGN_LAYOUT = [
  "Spacious",
  "Compact",
  "Modular",
] as const;

export const GITPAGE_DESIGN_COMPONENTS = [
  "Rounded & Soft",
  "Neutral & Sharp",
  "Bold & Loud",
] as const;

export const GITPAGE_DESIGN_INTERACTIONS = ["Energetic", "Subtle"] as const;

// Buttons + Contact form: the spec says "Gitpage button style values" / "Gitpage
// contact-form layout values" without enumerating them. Use a small starter
// list and keep the field as free-text-with-suggestions — server validation
// won't reject unknown values, so worst case gitpage falls back to its
// defaults. Tighten when we get the canonical list.
export const GITPAGE_DESIGN_BUTTONS = [
  "Solid Primary",
  "Outline",
  "Ghost",
  "Pill",
] as const;

export const GITPAGE_DESIGN_CONTACT_FORM = [
  "Centered Card",
  "Inline",
  "Sidebar",
] as const;

export const GITPAGE_DESIGN_ICONS = [
  "Heroicons Outline",
  "Font Awesome Solid",
  "Material Icons Rounded",
  "Lucide Icons",
] as const;

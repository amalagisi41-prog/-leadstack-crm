import type { WebsiteConfig } from "@/types/website";
import { isNicheKey } from "@/lib/website/niches";

/**
 * Server-side + client-side validation for a WebsiteConfig payload. Returns
 * an object whose keys are field paths and values are error messages. Empty
 * object means valid.
 *
 * Mirrors gitpage's documented field constraints:
 * - heading / heroStatement: 1–80 chars
 * - features / benefits: 1–60 chars (gitpage expects comma-separated 3 short items)
 * - email + URL formats per their validators
 * - if niche is set: must be one of the three known keys; for `local`, the
 *   page set is forced and business_details are required (services optional);
 *   for `vsl`, niche is just a flag — page handling is gitpage's problem.
 * - if build_type === "vsl": video_link is required (http(s) URL); pages /
 *   services / business validation is skipped (vsl is single-page).
 * - if build_type === "local" without niche: pages must include index.html;
 *   if services.html selected: at least one of services_list / let_ai_do_services;
 *   if contact.html selected: business_name / business_street / business_city all required.
 * - if design_color_palette === "Custom": custom_colors must be a 3-hex triple
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/i;
const HEX_TRIPLE_RE = /^#?[0-9a-f]{6}\s*,\s*#?[0-9a-f]{6}\s*,\s*#?[0-9a-f]{6}$/i;

export type ValidationErrors = Record<string, string>;

export function validateWebsiteConfig(config: WebsiteConfig): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!config.language?.trim()) errors.language = "Required.";
  if (!config.heading?.trim()) errors.heading = "Required.";
  else if (config.heading.length > 80)
    errors.heading = "Max 80 characters.";

  if (config.color_scheme !== "Standard" && config.color_scheme !== "Dark Mode")
    errors.color_scheme = "Pick a colour scheme.";

  if (!config.hero_statement?.trim()) errors.hero_statement = "Required.";
  else if (config.hero_statement.length > 80)
    errors.hero_statement = "Max 80 characters.";

  if (!config.features?.trim()) errors.features = "Required.";
  else if (config.features.length > 60)
    errors.features = "Max 60 characters (comma-separated 3 items).";

  if (!config.benefits?.trim()) errors.benefits = "Required.";
  else if (config.benefits.length > 60)
    errors.benefits = "Max 60 characters (comma-separated 3 items).";

  if (!config.contact_details?.trim())
    errors.contact_details = "Required.";
  else if (!EMAIL_RE.test(config.contact_details.trim()))
    errors.contact_details = "Must be a valid email address.";

  if (!config.cta_link?.trim()) errors.cta_link = "Required.";
  else if (!URL_RE.test(config.cta_link.trim()))
    errors.cta_link = "Must start with http:// or https://.";

  // Default missing build_type to "local" — back-compat for docs that
  // pre-date the VSL feature.
  const buildType = config.build_type ?? "local";

  // Niche key validation runs across both build types. null is valid (means
  // "no niche, run a generic build"). A non-null value must be a known key.
  if (config.niche != null && !isNicheKey(config.niche)) {
    errors.niche =
      'Niche must be one of: home_services, real_estate, gym_fitness. Leave blank for a generic build.';
  }
  const niche = isNicheKey(config.niche) ? config.niche : null;

  if (buildType === "vsl") {
    if (!config.video_link?.trim()) errors.video_link = "Required.";
    else if (!URL_RE.test(config.video_link.trim()))
      errors.video_link = "Must start with http:// or https:// (use the embed URL).";
    // VSL niche has no pages array. Nothing further to check here — the niche
    // flag itself was validated above.
  } else if (niche) {
    // Local + niche: page set is forced and contact-page fields are required.
    // services_list is optional — gitpage uses the niche default seed when
    // omitted. Page-selection inputs in the UI are hidden for niche, but if a
    // legacy doc carries different selections we don't error — the gitpage
    // client overrides them at submit time.
    const biz = config.business_details;
    if (!biz) {
      errors["business_details"] =
        "Niche templates require business details (contact page is forced on).";
    } else {
      if (!biz.business_name.trim())
        errors["business_details.business_name"] = "Required.";
      if (!biz.business_street.trim())
        errors["business_details.business_street"] = "Required.";
      if (!biz.business_city.trim())
        errors["business_details.business_city"] = "Required.";
    }
  } else {
    // Generic local: pages + conditional sections.
    // index.html must be on; UI locks this but we re-check.
    if (!config.local_page_selections?.index)
      errors["local_page_selections.index"] =
        "Home page (index.html) is required.";

    if (config.local_page_selections?.services) {
      const svc = config.services_config;
      if (!svc) {
        errors["services_config"] =
          "Configure services or untick services.html.";
      } else if (!svc.let_ai_do_services && !svc.services_list.trim()) {
        errors["services_config.services_list"] =
          "List your services or let AI generate them.";
      }
    }

    if (config.local_page_selections?.contact) {
      const biz = config.business_details;
      if (!biz) {
        errors["business_details"] =
          "Add business details or untick contact.html.";
      } else {
        if (!biz.business_name.trim())
          errors["business_details.business_name"] = "Required.";
        if (!biz.business_street.trim())
          errors["business_details.business_street"] = "Required.";
        if (!biz.business_city.trim())
          errors["business_details.business_city"] = "Required.";
      }
    }
  }

  // Custom palette requires a hex triple.
  if (
    config.design_color_palette === "Custom" &&
    !HEX_TRIPLE_RE.test(config.custom_colors.trim())
  ) {
    errors.custom_colors =
      'Three hex colours separated by commas, e.g. "#5B4BFF,#EEF0FF,#00E5A8".';
  }

  return errors;
}

/**
 * Convenience: returns the first error message, or null if valid. Used by
 * the form to show a single toast on submit.
 */
export function firstValidationError(
  errors: ValidationErrors,
): string | null {
  const keys = Object.keys(errors);
  if (keys.length === 0) return null;
  return errors[keys[0]];
}

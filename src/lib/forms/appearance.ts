import type { CSSProperties } from "react";
import {
  defaultFormAppearance,
  type FormAppearance,
  type FormSettings,
} from "@/types/forms";

/**
 * Resolve the appearance for a public form render. URL search params take
 * precedence (so an embed snippet can override per-deployment), then the
 * form's saved settings, then the hard-coded defaults.
 *
 * Recognised params:
 *   ?theme=light|dark
 *   ?accent=%237c3aed         (hex, # may be omitted; URL-encoded)
 *   ?embed=1                  (forces hideChrome on, transparent body)
 *   ?chrome=0                 (alias for embed=1's chrome behaviour)
 */
export function resolveAppearance(
  searchParams: Record<string, string | string[] | undefined>,
  settings: FormSettings | undefined,
): FormAppearance & { embed: boolean } {
  const fromSettings = settings?.appearance ?? defaultFormAppearance();

  const themeParam = pickString(searchParams.theme);
  const accentParam = pickString(searchParams.accent);
  const embedParam = pickString(searchParams.embed);
  const chromeParam = pickString(searchParams.chrome);
  const titleParam = pickString(searchParams.title);

  const embed = embedParam === "1" || chromeParam === "0";

  return {
    theme:
      themeParam === "dark"
        ? "dark"
        : themeParam === "light"
          ? "light"
          : fromSettings.theme,
    accent: normaliseHex(accentParam) ?? fromSettings.accent,
    hideChrome: embed || fromSettings.hideChrome,
    hideTitle:
      titleParam === "0" ? true : titleParam === "1" ? false : fromSettings.hideTitle,
    embed,
  };
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

/** Accept "7c3aed", "#7c3aed", "%237c3aed". Returns null on bad input. */
function normaliseHex(input: string | undefined): string | null {
  if (!input) return null;
  const hex = input.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{6}$/i.test(hex) && !/^[0-9a-f]{3}$/i.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

/**
 * Build the inline-style overrides for the wrapper div. Sets the shadcn
 * CSS variables (`--card`, `--background`, etc.) so descendants pick up
 * the chosen theme regardless of next-themes setting `.dark` on `<html>`.
 *
 * --primary is overridden with the accent so `bg-primary` on the submit
 * button picks up the user's colour.
 */
export function appearanceStyle(a: FormAppearance): CSSProperties {
  if (a.theme === "dark") {
    return {
      "--background": "oklch(0.145 0 0)",
      "--foreground": "oklch(0.985 0 0)",
      "--card": "oklch(0.205 0 0)",
      "--card-foreground": "oklch(0.985 0 0)",
      "--muted": "oklch(0.269 0 0)",
      "--muted-foreground": "oklch(0.708 0 0)",
      "--border": "oklch(1 0 0 / 10%)",
      "--input": "oklch(1 0 0 / 15%)",
      "--ring": a.accent,
      "--primary": a.accent,
      "--primary-foreground": "oklch(0.985 0 0)",
    } as CSSProperties;
  }
  return {
    "--background": "oklch(1 0 0)",
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--muted": "oklch(0.97 0 0)",
    "--muted-foreground": "oklch(0.556 0 0)",
    "--border": "oklch(0.922 0 0)",
    "--input": "oklch(0.922 0 0)",
    "--ring": a.accent,
    "--primary": a.accent,
    "--primary-foreground": "oklch(0.985 0 0)",
  } as CSSProperties;
}

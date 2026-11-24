import { continueRender, delayRender, staticFile } from "remotion";

/** AgentStack mark-system colors, sampled from public/brand/agentstack-logo-sheet.jpg. */
export const C = {
  navy: "#1F3A73",
  ink: "#14254D",
  coral: "#F2554A",
  coralSoft: "#FBD9D5",
  cream: "#F7EFE4",
  paper: "#FFFDF9",
  muted: "#6B7896",
  line: "#E6DCCD",
  green: "#2F9E6B",
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// One sans family in three weights. Geist ships no italic file, so italics
// are the browser's slanted Geist — the accent style is light italic.
const FONTS: Array<[family: string, file: string, weight: string]> = [
  ["Geist", "geist-sans-latin-300-normal.woff2", "300"],
  ["Geist", "geist-sans-latin-400-normal.woff2", "400"],
  ["Geist", "geist-sans-latin-600-normal.woff2", "600"],
  ["Geist", "geist-sans-latin-800-normal.woff2", "800"],
];

let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("fonts");
  Promise.all(
    FONTS.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, { weight });
      document.fonts.add(face);
      return face.load();
    }),
  ).then(() => continueRender(handle));
}

export const SANS = "Geist, system-ui, sans-serif";

/** Weights: heavy for the instruction, regular for body, light italic for the accent word. */
export const W = { light: 300, regular: 400, medium: 600, heavy: 800 } as const;

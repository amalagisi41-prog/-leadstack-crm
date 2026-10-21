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

const FONTS: Array<[family: string, file: string, weight: string, style?: string]> = [
  ["Geist", "geist-sans-latin-400-normal.woff2", "400"],
  ["Geist", "geist-sans-latin-600-normal.woff2", "600"],
  ["Geist", "geist-sans-latin-800-normal.woff2", "800"],
  ["Instrument Serif", "instrument-serif-latin-400-italic.woff2", "400", "italic"],
];

let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("fonts");
  Promise.all(
    FONTS.map(([family, file, weight, style]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, {
        weight,
        style: style ?? "normal",
      });
      document.fonts.add(face);
      return face.load();
    }),
  ).then(() => continueRender(handle));
}

export const SANS = "Geist, system-ui, sans-serif";
export const SERIF = "'Instrument Serif', Georgia, serif";

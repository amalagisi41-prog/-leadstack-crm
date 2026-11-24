// Renders one onboarding video to out/<id>.mp4.
//
//   node scripts/render.mjs connect-email
//
// CHROME_PATH lets the render use an already-installed Chromium (CI, or an
// environment where Remotion can't download its own headless shell).
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
if (!id) throw new Error("Usage: node scripts/render.mjs <video-id>");

const serveUrl = await bundle({ entryPoint: join(root, "src/index.ts") });
const browserExecutable = process.env.CHROME_PATH ?? null;
const composition = await selectComposition({ serveUrl, id, browserExecutable });

await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  crf: 20,
  outputLocation: join(root, "out", `${id}.mp4`),
  browserExecutable,
  onProgress: (() => {
    let last = -1;
    return ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) console.log(`${id}: ${(last = pct)}%`);
    };
  })(),
});
console.log(`\nWrote out/${id}.mp4`);

// Generates Zack's voiceover for a video script, one clip per scene, and
// writes a manifest with each clip's duration so scenes are timed to the
// voice rather than the other way round.
//
//   node scripts/voice.mjs connect-email
//
// Engine: Piper (local, free) with the "Ryan" voice by default. Set
// PIPER_MODEL to another .onnx voice, or replace synthesize() with an
// ElevenLabs / OpenAI TTS call to upgrade Zack's voice — nothing else
// changes.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv[2];
if (!id) throw new Error("Usage: node scripts/voice.mjs <video-id>");

const model = process.env.PIPER_MODEL;
if (!model) throw new Error("Set PIPER_MODEL to the path of a Piper .onnx voice (e.g. en-us-ryan-high.onnx).");

const script = JSON.parse(readFileSync(join(root, "src/videos", `${id}.json`), "utf8"));
const outDir = join(root, "public/voice", id);
mkdirSync(outDir, { recursive: true });

function synthesize(text, file) {
  // length_scale > 1 slows delivery slightly: clearer for first-time users.
  execFileSync("piper", ["-m", model, "--length_scale", "1.08", "--sentence_silence", "0.35", "-f", file], {
    input: text,
    stdio: ["pipe", "ignore", "inherit"],
  });
}

function durationSeconds(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(String(out).trim());
}

const scenes = script.scenes.map((scene) => {
  const file = join(outDir, `${scene.id}.wav`);
  synthesize(scene.line, file);
  const seconds = durationSeconds(file);
  console.log(`${scene.id}: ${seconds.toFixed(2)}s`);
  return { id: scene.id, audio: `voice/${id}/${scene.id}.wav`, seconds };
});

writeFileSync(join(root, "src/generated", `${id}.json`), JSON.stringify({ id, scenes }, null, 2) + "\n");

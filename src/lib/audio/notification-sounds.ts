/**
 * Synthesised notification sounds for the agency live-visitors map.
 * Web Audio API only — no audio assets to host or ship to the buyer.
 *
 * Two sounds:
 *   - playDing()    — a single pleasing bell tone, fires when a
 *                     visitor's state transitions to "buy-clicked"
 *   - playKaching() — a two-note "cash register" arpeggio, fires when
 *                     a visitor's state transitions to "purchased"
 *
 * Browser autoplay policy: Web Audio requires a prior user gesture on
 * the page before sound plays. The mute-toggle button click counts as
 * that gesture, so once the operator interacts with the page at all,
 * subsequent sounds work. If the policy still blocks playback we
 * swallow the error silently — sounds are a nicety, never a blocker.
 *
 * Reuses a single AudioContext per page session for efficiency.
 */

let cachedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (cachedCtx) return cachedCtx;
  type WindowWithWebkit = Window &
    typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
  const win = window as WindowWithWebkit;
  const Ctor = window.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedCtx = new Ctor();
    return cachedCtx;
  } catch {
    return null;
  }
}

/**
 * Plays one bell-like tone at the operator's speakers. ~0.4s duration,
 * gentle attack + exponential decay. Sounds friendly, not alarming.
 */
export function playDing(): void {
  const ctx = getCtx();
  if (!ctx) return;
  // Some browsers suspend the context until a user gesture; nudge it.
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const master = ctx.createGain();
  // Conservative master volume — operator's environment is unpredictable.
  master.gain.value = 0.25;
  master.connect(ctx.destination);

  // Fundamental: a major sixth above A4 → C#6 (1108Hz). Bright but
  // not piercing. Bell timbre comes from the second partial below.
  voiceTone({ ctx, dest: master, frequency: 1108, startAt: now, duration: 0.4 });
  // Quiet higher partial gives the metallic shimmer of a real bell.
  voiceTone({ ctx, dest: master, frequency: 2217, startAt: now, duration: 0.35, gain: 0.12 });
}

/**
 * Plays the classic two-note cash-register "ka-ching" — two short
 * bright tones, ~120ms apart, plus a quick noise click on the first
 * beat for the mechanical-strike character.
 */
export function playKaching(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const master = ctx.createGain();
  // A hair louder than ding — purchases are the real event.
  master.gain.value = 0.32;
  master.connect(ctx.destination);

  // The two tones — perfect fourth interval (D6 then G6).
  voiceTone({ ctx, dest: master, frequency: 1175, startAt: now, duration: 0.18 });
  voiceTone({ ctx, dest: master, frequency: 1568, startAt: now + 0.12, duration: 0.32 });
  // Tiny noise burst on the strike — sells the "register cash drawer"
  // feel. Bandpass-filtered noise to keep it focused.
  noiseClick({ ctx, dest: master, startAt: now, duration: 0.04 });
}

interface ToneParams {
  ctx: AudioContext;
  dest: AudioNode;
  frequency: number;
  startAt: number;
  duration: number;
  /** Per-tone gain multiplier on top of the master. Default 1. */
  gain?: number;
}

function voiceTone({ ctx, dest, frequency, startAt, duration, gain = 1 }: ToneParams) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = frequency;
  const env = ctx.createGain();
  // Fast attack (5ms) + exponential decay over `duration`. linearRampToValueAtTime
  // could clip; exponentialRampToValueAtTime gives a more bell-like fall.
  env.gain.setValueAtTime(0.0001, startAt);
  env.gain.exponentialRampToValueAtTime(gain, startAt + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(env).connect(dest);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function noiseClick({
  ctx,
  dest,
  startAt,
  duration,
}: {
  ctx: AudioContext;
  dest: AudioNode;
  startAt: number;
  duration: number;
}) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  // Bandpass around 4kHz keeps it as a "tick", not full hiss.
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 4000;
  bp.Q.value = 1.8;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, startAt);
  env.gain.exponentialRampToValueAtTime(0.3, startAt + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  noise.connect(bp).connect(env).connect(dest);
  noise.start(startAt);
  noise.stop(startAt + duration + 0.02);
}

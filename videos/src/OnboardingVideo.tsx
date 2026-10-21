import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import { C, FPS, SANS, SERIF, loadFonts } from "./brand";
import { Zack, type ZackPose } from "./Zack";
import {
  AddressVisual,
  ChoicesVisual,
  HelloVisual,
  InboxVisual,
  OutroVisual,
  ProgressVisual,
  StepsVisual,
} from "./scenes/visuals";

loadFonts();

export interface SceneScript {
  id: string;
  pose: ZackPose;
  visual: string;
  headline: string[];
  sub?: string;
  line: string;
}

export interface TimedScene extends SceneScript {
  audio: string;
  seconds: number;
}

// A type alias, not an interface: Remotion needs props assignable to Record<string, unknown>.
export type OnboardingVideoProps = {
  title: string;
  scenes: TimedScene[];
};

/** Frames the voice starts after a scene begins, and the breath after it ends. */
export const LEAD_IN = 8;
export const TAIL = 14;

export const sceneFrames = (s: TimedScene) => LEAD_IN + Math.ceil(s.seconds * FPS) + TAIL;

const VISUALS: Record<string, React.FC<{ sub?: string }>> = {
  hello: HelloVisual,
  inbox: InboxVisual,
  choices: ChoicesVisual,
  address: AddressVisual,
  steps: StepsVisual,
  progress: ProgressVisual,
  outro: OutroVisual,
};

/** Words wrapped in *asterisks* render as the coral serif accent. */
const Headline: React.FC<{ words: string[] }> = ({ words }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  let accent = false;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: 26, rowGap: 0, maxWidth: 1020 }}>
      {words.map((raw, i) => {
        const starts = raw.startsWith("*");
        if (starts) accent = true;
        const isAccent = accent;
        if (raw.endsWith("*")) accent = false;
        const word = raw.replace(/\*/g, "");
        const s = spring({ frame: f - 4 - i * 4, fps, config: { damping: 15, stiffness: 160 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              fontFamily: isAccent ? SERIF : SANS,
              fontStyle: isAccent ? "italic" : "normal",
              fontWeight: isAccent ? 400 : 800,
              fontSize: isAccent ? 128 : 112,
              lineHeight: 1.08,
              letterSpacing: isAccent ? -1 : -4,
              color: isAccent ? C.coral : C.ink,
              opacity: s,
              transform: `translateY(${(1 - s) * 40}px)`,
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

const SceneBody: React.FC<{ scene: TimedScene; frames: number }> = ({ scene, frames }) => {
  const f = useCurrentFrame();
  const fadeOut = interpolate(f, [frames - 8, frames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const Visual = VISUALS[scene.visual] ?? HelloVisual;
  return (
    <AbsoluteFill style={{ left: 720, right: 110, justifyContent: "center", gap: 56, opacity: fadeOut }}>
      <Headline words={scene.headline} />
      <div style={{ alignSelf: "flex-start" }}>
        <Visual sub={scene.sub} />
      </div>
    </AbsoluteFill>
  );
};

/** Mouth openness from the loudness of the current scene's voice clip. */
function useMouth(scenes: TimedScene[], index: number, localFrame: number): number {
  const datas = scenes.map((s) => useAudioData(staticFile(s.audio))); // fixed-length list per render
  const data = datas[index];
  const audioFrame = localFrame - LEAD_IN;
  if (!data || audioFrame < 0 || audioFrame > scenes[index].seconds * FPS) return 0;
  const bins = visualizeAudio({ fps: FPS, frame: audioFrame, audioData: data, numberOfSamples: 32 });
  const level = bins.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
  return Math.min(1, level * 9);
}

export const OnboardingVideo: React.FC<OnboardingVideoProps> = ({ title, scenes }) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const starts: number[] = [];
  scenes.reduce((acc, s) => {
    starts.push(acc);
    return acc + sceneFrames(s);
  }, 0);
  let index = starts.findIndex((start, i) => f >= start && f < start + sceneFrames(scenes[i]));
  if (index < 0) index = scenes.length - 1;
  const local = f - starts[index];
  const mouth = useMouth(scenes, index, local);

  const enter = spring({ frame: f, fps, config: { damping: 13, stiffness: 90 } });
  const outro = interpolate(f, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  const progress = f / durationInFrames;

  return (
    <AbsoluteFill style={{ background: C.cream, opacity: outro }}>
      {/* Brand watermark: the roof chevron, huge and faint. */}
      <svg width={1400} height={900} viewBox="0 0 140 90" style={{ position: "absolute", right: -260, bottom: -330, opacity: 0.06 }}>
        <polyline points="10,80 70,20 130,80" fill="none" stroke={C.navy} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div style={{ position: "absolute", top: 60, left: 90, display: "flex", alignItems: "center", gap: 16 }}>
        <Img src={staticFile("brand/agentstack-mark-on-light.png")} style={{ width: 52, height: 52 }} />
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 30, color: C.ink }}>AgentStack</span>
        <span style={{ fontFamily: SANS, fontSize: 30, color: C.muted }}>· {title}</span>
      </div>

      <div style={{ position: "absolute", left: 120, bottom: 120, transform: `scale(${enter})`, transformOrigin: "bottom center" }}>
        <Zack pose={scenes[index].pose} mouth={mouth} look={0.6} size={520} />
      </div>

      {scenes.map((scene, i) => (
        <Sequence key={scene.id} from={starts[i]} durationInFrames={sceneFrames(scene)}>
          <SceneBody scene={scene} frames={sceneFrames(scene)} />
          <Sequence from={LEAD_IN}>
            <Audio src={staticFile(scene.audio)} />
          </Sequence>
        </Sequence>
      ))}

      <div style={{ position: "absolute", left: 0, bottom: 0, height: 10, width: `${progress * 100}%`, background: C.coral }} />
    </AbsoluteFill>
  );
};

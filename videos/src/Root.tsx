import React from "react";
import { Composition, Still } from "remotion";
import { ZackSheet } from "./ZackSheet";
import { FPS, HEIGHT, WIDTH } from "./brand";
import { OnboardingVideo, sceneFrames, type SceneScript, type TimedScene } from "./OnboardingVideo";
import connectEmail from "./videos/connect-email.json";
import connectEmailVoice from "./generated/connect-email.json";

function timed(
  script: { title: string; scenes: SceneScript[] },
  voice: { scenes: Array<{ id: string; audio: string; seconds: number }> },
) {
  const scenes: TimedScene[] = script.scenes.map((s) => {
    const v = voice.scenes.find((x) => x.id === s.id);
    if (!v) throw new Error(`No voice clip for scene "${s.id}" — run npm run voice`);
    return { ...s, audio: v.audio, seconds: v.seconds };
  });
  return { title: script.title, scenes };
}

const videos = [{ id: "connect-email", props: timed(connectEmail as never, connectEmailVoice) }];

export const Root: React.FC = () => (
  <>
    <Still id="zack-sheet" component={ZackSheet} width={2560} height={2080} />
    {videos.map((v) => (
      <Composition
        key={v.id}
        id={v.id}
        component={OnboardingVideo}
        durationInFrames={v.props.scenes.reduce((n, s) => n + sceneFrames(s), 0)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={v.props}
      />
    ))}
  </>
);

import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C } from "./brand";

export type ZackPose = "idle" | "wave" | "point" | "thumbs" | "cheer";

/**
 * Zack — the AgentStack guide. Built straight from the mark: the robot face
 * from the logo (rounded head, side nubs, pill eyes, smile), wearing the
 * coral roof chevron as a floating halo so he always reads as "the
 * AgentStack house". He hovers instead of walking; the soft shadow under him
 * breathes with the bob.
 */
export const Zack: React.FC<{
  pose?: ZackPose;
  /** 0 = closed smile, 1 = wide open (drive from the voice track). */
  mouth?: number;
  /** Eye offset in px, -1..1 horizontally — where Zack is looking. */
  look?: number;
  size?: number;
}> = ({ pose = "idle", mouth = 0, look = 0, size = 520 }) => {
  const f = useCurrentFrame();
  const bob = Math.sin(f / 18) * 8;
  const haloBob = Math.sin((f - 6) / 18) * 11;

  // Blink for 5 frames roughly every 3.3s, offset so it never feels metronomic.
  const cycle = (f + 37) % 100;
  const blink = cycle < 5 ? interpolate(cycle, [0, 2, 5], [1, 0.1, 1]) : 1;

  const swing = Math.sin(f / 4) * 18;
  const bounce = Math.sin(f / 5) * 10;
  const arms: Record<ZackPose, [left: number, right: number]> = {
    idle: [22, -22],
    wave: [22, -150 + swing],
    point: [22, -98],
    thumbs: [22, -118],
    cheer: [128 + bounce, -128 - bounce],
  };
  const [leftAngle, rightAngle] = arms[pose];

  const eyeX = look * 8;
  const open = Math.max(0, Math.min(1, mouth));

  const arm = (x: number, angle: number, thumb: boolean) => (
    <g transform={`translate(${x} 318) rotate(${angle})`}>
      <line x1={0} y1={0} x2={0} y2={92} stroke={C.navy} strokeWidth={26} strokeLinecap="round" />
      <circle cx={0} cy={104} r={18} fill={C.paper} stroke={C.navy} strokeWidth={8} />
      {thumb ? (
        <rect x={-6} y={110} width={12} height={22} rx={6} fill={C.paper} stroke={C.navy} strokeWidth={6} />
      ) : null}
    </g>
  );

  return (
    <svg width={size} height={size * (540 / 420)} viewBox="0 0 420 540" style={{ overflow: "visible" }}>
      <ellipse
        cx={210}
        cy={512}
        rx={92 - bob * 1.5}
        ry={13}
        fill={C.ink}
        opacity={0.12 - bob * 0.004}
      />
      <g transform={`translate(0 ${bob})`}>
        <polyline
          points="92,138 210,48 328,138"
          transform={`translate(0 ${haloBob - bob})`}
          fill="none"
          stroke={C.coral}
          strokeWidth={34}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {arm(140, leftAngle, false)}
        {arm(280, rightAngle, pose === "thumbs")}

        <rect x={190} y={278} width={40} height={24} rx={6} fill={C.navy} />
        <rect x={134} y={296} width={152} height={134} rx={42} fill={C.navy} />
        <polyline
          points="178,372 210,346 242,372"
          fill="none"
          stroke={C.coral}
          strokeWidth={13}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={210} cy={396} r={7} fill={C.cream} />

        <rect x={82} y={188} width={32} height={42} rx={12} fill={C.navy} />
        <rect x={306} y={188} width={32} height={42} rx={12} fill={C.navy} />
        <rect x={108} y={134} width={204} height={152} rx={48} fill={C.paper} stroke={C.navy} strokeWidth={16} />

        <ellipse cx={150} cy={242} rx={15} ry={9} fill={C.coral} opacity={0.28} />
        <ellipse cx={270} cy={242} rx={15} ry={9} fill={C.coral} opacity={0.28} />

        {[176, 244].map((cx) => (
          <rect
            key={cx}
            x={cx - 11 + eyeX}
            y={176 + 22 * (1 - blink)}
            width={22}
            height={44 * blink}
            rx={11}
            fill={C.navy}
          />
        ))}

        {open < 0.22 ? (
          <path d="M178 244 Q210 268 242 244" fill="none" stroke={C.navy} strokeWidth={10} strokeLinecap="round" />
        ) : (
          <g>
            <ellipse cx={210} cy={250} rx={24 - open * 4} ry={5 + open * 15} fill={C.navy} />
            <ellipse cx={210} cy={256 + open * 6} rx={11} ry={3 + open * 5} fill={C.coral} opacity={0.85} />
          </g>
        )}
      </g>
    </svg>
  );
};

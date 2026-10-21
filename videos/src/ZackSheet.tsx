import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, SANS, W, loadFonts } from "./brand";
import { Zack, type ZackPose } from "./Zack";

loadFonts();

const POSES: Array<[ZackPose, string, string]> = [
  ["wave", "Hello", "Openers, welcomes"],
  ["point", "Show", "Pointing at the thing to do"],
  ["idle", "Listen", "Questions, thinking moments"],
  ["thumbs", "Nice", "A step confirmed"],
  ["cheer", "Done", "Milestones, 100% set up"],
];

const SWATCHES: Array<[string, string, string]> = [
  ["Navy", C.navy, "Body, outlines, type"],
  ["Coral", C.coral, "The roof · emphasis"],
  ["Cream", C.cream, "Backgrounds"],
  ["Paper", C.paper, "Face, cards"],
  ["Done green", C.green, "Verified only"],
];

const RULES = [
  "The coral roof always floats above his head. It's what makes him the AgentStack house.",
  "He hovers, he never walks. Keep the soft shadow beneath him.",
  "Green means confirmed. Zack never shows a check for something that isn't really done.",
  "One idea per scene. Zack points at it, the words name it.",
];

/** Zack character + brand sheet, rendered as a still. */
export const ZackSheet: React.FC = () => (
  <AbsoluteFill style={{ background: C.cream, padding: "90px 110px", fontFamily: SANS, color: C.ink }}>
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <Img src={staticFile("brand/agentstack-mark-on-light.png")} style={{ width: 56, height: 56 }} />
      <span style={{ fontWeight: 800, fontSize: 30 }}>AgentStack</span>
      <span style={{ fontSize: 30, color: C.muted }}>· Character sheet</span>
    </div>

    <div style={{ display: "flex", alignItems: "flex-end", gap: 80, marginTop: 40 }}>
      <Zack pose="wave" size={560} look={0.4} />
      <div style={{ paddingBottom: 90 }}>
        <div style={{ fontWeight: 800, fontSize: 200, letterSpacing: -8, lineHeight: 0.9 }}>
          Zack<span style={{ color: C.coral }}>.</span>
        </div>
        <div style={{ fontStyle: "italic", fontWeight: W.light, fontSize: 64, color: C.coral, marginTop: 18 }}>
          Your AgentStack guide
        </div>
        <p style={{ fontSize: 34, lineHeight: 1.45, color: C.muted, maxWidth: 980, marginTop: 30 }}>
          The friendly face from the AgentStack mark, given a body and a job: walk every agent from
          sign-up to fully set up, one small step at a time. Calm, plain-spoken, never technical, and
          never says something is done until it is.
        </p>
      </div>
    </div>

    <div style={{ display: "flex", gap: 30, marginTop: 30 }}>
      {POSES.map(([pose, name, use]) => (
        <div
          key={pose}
          style={{
            flex: 1,
            background: C.paper,
            border: `3px solid ${C.line}`,
            borderRadius: 32,
            padding: "26px 24px 30px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Zack pose={pose} size={250} />
          <div style={{ fontWeight: 800, fontSize: 36, marginTop: 6 }}>{name}</div>
          <div style={{ fontSize: 24, color: C.muted, marginTop: 4, textAlign: "center" }}>{use}</div>
        </div>
      ))}
    </div>

    <div style={{ display: "flex", gap: 60, marginTop: 60 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 30, letterSpacing: 3, color: C.coral }}>PALETTE</div>
        <div style={{ display: "flex", gap: 22, marginTop: 22 }}>
          {SWATCHES.map(([name, hex, use]) => (
            <div key={name} style={{ flex: 1 }}>
              <div style={{ height: 120, borderRadius: 24, background: hex, border: `3px solid ${C.line}` }} />
              <div style={{ fontWeight: 800, fontSize: 26, marginTop: 12 }}>{name}</div>
              <div style={{ fontSize: 22, color: C.muted }}>{hex}</div>
              <div style={{ fontSize: 22, color: C.muted }}>{use}</div>
            </div>
          ))}
        </div>
        <div style={{ fontWeight: 800, fontSize: 30, letterSpacing: 3, color: C.coral, marginTop: 50 }}>TYPE</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 30, marginTop: 14 }}>
          <span style={{ fontWeight: W.heavy, fontSize: 90, letterSpacing: -3 }}>Heavy</span>
          <span style={{ fontWeight: W.regular, fontSize: 90, letterSpacing: -2 }}>Regular</span>
          <span style={{ fontStyle: "italic", fontWeight: W.light, fontSize: 90, letterSpacing: -2, color: C.coral }}>Light italic</span>
        </div>
        <div style={{ fontSize: 26, color: C.muted, marginTop: 6 }}>
          All Geist, one sans family. Heavy says the instruction, regular explains, coral light italic marks the one word that matters.
        </div>
      </div>

      <div style={{ width: 900 }}>
        <div style={{ fontWeight: 800, fontSize: 30, letterSpacing: 3, color: C.coral }}>HOW ZACK BEHAVES</div>
        {RULES.map((rule, i) => (
          <div key={i} style={{ display: "flex", gap: 22, marginTop: 24 }}>
            <span
              style={{
                flexShrink: 0,
                width: 52,
                height: 52,
                borderRadius: 26,
                background: C.navy,
                color: C.cream,
                fontWeight: 800,
                fontSize: 26,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 30, lineHeight: 1.4 }}>{rule}</span>
          </div>
        ))}
      </div>
    </div>
  </AbsoluteFill>
);

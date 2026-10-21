import React from "react";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, SANS, SERIF } from "../brand";

const pop = (frame: number, fps: number, delay: number) =>
  spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 140 } });

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      background: C.paper,
      border: `3px solid ${C.line}`,
      borderRadius: 32,
      boxShadow: "0 18px 40px rgba(20,37,77,0.08)",
      ...style,
    }}
  >
    {children}
  </div>
);

const Envelope: React.FC<{ color: string; size?: number }> = ({ color, size = 96 }) => (
  <svg width={size} height={size * 0.72} viewBox="0 0 100 72">
    <rect x={4} y={4} width={92} height={64} rx={12} fill={C.paper} stroke={color} strokeWidth={7} />
    <polyline points="10,14 50,44 90,14" fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Bubble: React.FC<{ color: string; size?: number }> = ({ color, size = 96 }) => (
  <svg width={size} height={size * 0.8} viewBox="0 0 100 80">
    <path
      d="M14 6 H86 Q96 6 96 16 V48 Q96 58 86 58 H40 L22 74 V58 H14 Q4 58 4 48 V16 Q4 6 14 6 Z"
      fill={C.paper}
      stroke={color}
      strokeWidth={7}
      strokeLinejoin="round"
    />
    {[32, 50, 68].map((x) => (
      <circle key={x} cx={x} cy={32} r={5} fill={color} />
    ))}
  </svg>
);

const Check: React.FC<{ size?: number; color?: string }> = ({ size = 40, color = C.green }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <circle cx={20} cy={20} r={19} fill={color} />
    <polyline points="11,21 17,27 29,14" fill="none" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const HelloVisual: React.FC<{ sub?: string }> = ({ sub }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(f, fps, 18);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22, opacity: s, transform: `translateY(${(1 - s) * 20}px)` }}>
      <div style={{ width: 64, height: 6, borderRadius: 3, background: C.coral }} />
      <span style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 54, color: C.muted }}>{sub}</span>
    </div>
  );
};

export const InboxVisual: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const items = [
    { el: <Envelope color={C.coral} size={84} />, delay: 18 },
    { el: <Bubble color={C.navy} size={84} />, delay: 34 },
    { el: <Envelope color={C.navy} size={84} />, delay: 50 },
  ];
  const landed = items.filter((i) => f > i.delay + 14).length;
  return (
    <div style={{ position: "relative", width: 820, height: 330 }}>
      {items.map((item, i) => {
        const t = interpolate(f, [item.delay, item.delay + 16], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const x = interpolate(t, [0, 1], [760, 300 + i * 6]);
        const y = interpolate(t, [0, 0.6, 1], [40 + i * 70, 20, 150]);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, opacity: t < 1 ? 1 : 0, transform: `rotate(${(1 - t) * 12}deg)` }}>
            {item.el}
          </div>
        );
      })}
      <Card style={{ position: "absolute", left: 120, top: 170, width: 470, height: 150, display: "flex", alignItems: "center", gap: 24, padding: "0 34px" }}>
        <svg width={88} height={70} viewBox="0 0 88 70">
          <path d="M6 30 H28 L36 44 H52 L60 30 H82 V60 Q82 66 76 66 H12 Q6 66 6 60 Z" fill={C.coralSoft} stroke={C.navy} strokeWidth={6} strokeLinejoin="round" />
          <polyline points="6,30 18,6 70,6 82,30" fill="none" stroke={C.navy} strokeWidth={6} strokeLinejoin="round" />
        </svg>
        <div style={{ fontFamily: SANS }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: C.ink }}>Inbox</div>
          <div style={{ fontSize: 24, color: C.muted, whiteSpace: "nowrap" }}>{landed} new {landed === 1 ? "lead" : "leads"}</div>
        </div>
        <div
          style={{
            marginLeft: "auto",
            minWidth: 52,
            height: 52,
            borderRadius: 26,
            background: C.coral,
            color: "#fff",
            fontFamily: SANS,
            fontWeight: 800,
            fontSize: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${1 + (landed > 0 ? 0.15 * Math.max(0, 1 - ((f - 18) % 16) / 8) : 0)})`,
          }}
        >
          {landed}
        </div>
      </Card>
    </div>
  );
};

export const ChoicesVisual: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const choices = [
    { label: "Gmail", icon: <Envelope color={C.coral} size={92} /> },
    { label: "Outlook", icon: <Envelope color={C.navy} size={92} /> },
    { label: "Text messages", icon: <Bubble color={C.navy} size={92} /> },
  ];
  const highlight = f > 110;
  return (
    <div style={{ display: "flex", gap: 28 }}>
      {choices.map((c, i) => {
        const s = pop(f, fps, 14 + i * 9);
        const active = highlight && i === 0;
        return (
          <Card
            key={c.label}
            style={{
              width: 250,
              height: 250,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 26,
              transform: `scale(${s * (active ? 1.06 : 1)}) translateY(${active ? -8 : 0}px)`,
              borderColor: active ? C.coral : C.line,
            }}
          >
            {c.icon}
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 32, color: C.ink }}>{c.label}</div>
          </Card>
        );
      })}
    </div>
  );
};

export const AddressVisual: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(f, fps, 14);
  const sweep = interpolate(f, [60, 85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Card style={{ padding: "48px 64px", transform: `scale(${s})`, transformOrigin: "left center" }}>
      <div style={{ fontFamily: SANS, fontSize: 30, color: C.muted, marginBottom: 14 }}>Your work email</div>
      <div style={{ fontFamily: SANS, fontSize: 84, fontWeight: 600, color: C.ink, letterSpacing: -2 }}>
        jane
        <span style={{ position: "relative", color: sweep > 0.5 ? C.coral : C.ink }}>
          @gmail.com
          <span
            style={{
              position: "absolute",
              left: 0,
              bottom: 2,
              height: 14,
              width: `${sweep * 100}%`,
              background: C.coral,
              opacity: 0.25,
              borderRadius: 7,
            }}
          />
        </span>
      </div>
    </Card>
  );
};

export const StepsVisual: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = ["Sign in", "Approve", "Done"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      {steps.map((label, i) => {
        const on = f > 20 + i * 32;
        const s = pop(f, fps, 20 + i * 32);
        const last = i === steps.length - 1;
        return (
          <React.Fragment key={label}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "26px 38px",
                borderRadius: 999,
                fontFamily: SANS,
                fontWeight: 800,
                fontSize: 38,
                background: on ? (last ? C.green : C.navy) : C.paper,
                color: on ? "#fff" : C.muted,
                border: `3px solid ${on ? "transparent" : C.line}`,
                transform: `scale(${0.9 + 0.1 * s})`,
              }}
            >
              {last && on ? <Check size={40} color="rgba(255,255,255,0.25)" /> : null}
              {label}
            </div>
            {i < steps.length - 1 ? (
              <svg width={44} height={24} viewBox="0 0 44 24">
                <polyline points="2,12 38,12 28,3 38,12 28,21" fill="none" stroke={C.coral} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const ProgressVisual: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const done = f > 50;
  const s = pop(f, fps, 50);
  const enter = pop(f, fps, 10);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "26px 40px",
        borderRadius: 999,
        background: C.paper,
        border: `3px solid ${C.line}`,
        boxShadow: "0 18px 40px rgba(20,37,77,0.10)",
        fontFamily: SANS,
        transform: `translateY(${(1 - enter) * 40}px)`,
        opacity: enter,
      }}
    >
      <span style={{ background: C.coralSoft, color: C.coral, fontWeight: 800, fontSize: 32, padding: "8px 20px", borderRadius: 999 }}>
        {done ? 2 : 1} of 6
      </span>
      <span style={{ fontSize: 36, fontWeight: 600, color: C.ink }}>
        {done ? "Next: Connect your listings" : "Next: Connect your email"}
      </span>
      <span style={{ transform: `scale(${s})`, display: "flex" }}>
        <Check size={46} />
      </span>
    </div>
  );
};

export const OutroVisual: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const steps = ["Business details", "Email or phone", "Listings", "Social", "Payments", "Domain"];
  return (
    <Card style={{ padding: "34px 44px", width: 640 }}>
      {steps.map((label, i) => {
        const s = pop(f, fps, 10 + i * 5);
        const checked = i < 2;
        const current = i === 2;
        return (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "12px 0",
              opacity: s,
              transform: `translateX(${(1 - s) * 30}px)`,
              fontFamily: SANS,
              fontSize: 32,
              fontWeight: current ? 800 : 600,
              color: checked ? C.muted : current ? C.ink : "#A9B1C4",
            }}
          >
            {checked ? (
              <Check size={38} />
            ) : (
              <span style={{ width: 38, height: 38, borderRadius: 19, border: `4px solid ${current ? C.coral : C.line}` }} />
            )}
            <span style={{ textDecoration: checked ? "line-through" : "none" }}>{label}</span>
            {current ? (
              <span style={{ marginLeft: "auto", fontSize: 24, color: C.coral, fontWeight: 800 }}>NEXT</span>
            ) : null}
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, paddingTop: 20, borderTop: `3px solid ${C.line}` }}>
        <Img src={staticFile("brand/agentstack-mark-on-light.png")} style={{ width: 44, height: 44 }} />
        <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 28, color: C.ink }}>AgentStack</span>
      </div>
    </Card>
  );
};

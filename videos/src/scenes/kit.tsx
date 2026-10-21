import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, SANS, W } from "../brand";

/**
 * Data-driven illustrations, so a new video is a script file, not new code.
 * Every icon is a few strokes in the brand palette — the "extremely simple
 * illustration" rule: one idea per drawing, readable at a glance.
 */

export type IconName =
  | "envelope"
  | "bubble"
  | "phone"
  | "house"
  | "calendar"
  | "chart"
  | "form"
  | "bolt"
  | "globe"
  | "card"
  | "facebook"
  | "instagram"
  | "user"
  | "upload"
  | "search"
  | "megaphone"
  | "check"
  | "star"
  | "key"
  | "list";

export const Icon: React.FC<{ name: IconName; color?: string; size?: number }> = ({
  name,
  color = C.navy,
  size = 92,
}) => {
  const s = { fill: "none", stroke: color, strokeWidth: 7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, React.ReactNode> = {
    envelope: (
      <>
        <rect x={8} y={20} width={84} height={60} rx={12} {...s} fill={C.paper} />
        <polyline points="14,28 50,56 86,28" {...s} />
      </>
    ),
    bubble: (
      <>
        <path d="M18 18 H82 Q92 18 92 28 V58 Q92 68 82 68 H44 L26 84 V68 H18 Q8 68 8 58 V28 Q8 18 18 18 Z" {...s} fill={C.paper} />
        {[34, 50, 66].map((x) => (
          <circle key={x} cx={x} cy={43} r={5} fill={color} />
        ))}
      </>
    ),
    phone: (
      <>
        <rect x={28} y={8} width={44} height={84} rx={10} {...s} fill={C.paper} />
        <line x1={44} y1={80} x2={56} y2={80} {...s} />
      </>
    ),
    house: (
      <>
        <polyline points="10,50 50,16 90,50" {...s} />
        <path d="M22 44 V86 H78 V44" {...s} fill={C.paper} />
        <rect x={42} y={60} width={16} height={26} rx={3} {...s} />
      </>
    ),
    calendar: (
      <>
        <rect x={12} y={20} width={76} height={68} rx={12} {...s} fill={C.paper} />
        <line x1={12} y1={40} x2={88} y2={40} {...s} />
        <line x1={32} y1={10} x2={32} y2={28} {...s} />
        <line x1={68} y1={10} x2={68} y2={28} {...s} />
        <circle cx={50} cy={64} r={7} fill={color} />
      </>
    ),
    chart: (
      <>
        <polyline points="12,86 88,86" {...s} />
        <rect x={20} y={56} width={14} height={30} rx={3} fill={color} />
        <rect x={43} y={40} width={14} height={46} rx={3} fill={color} />
        <rect x={66} y={20} width={14} height={66} rx={3} fill={color} />
      </>
    ),
    form: (
      <>
        <rect x={16} y={8} width={68} height={84} rx={10} {...s} fill={C.paper} />
        {[30, 48, 66].map((y) => (
          <line key={y} x1={28} y1={y} x2={72} y2={y} {...s} />
        ))}
      </>
    ),
    bolt: <polygon points="56,6 20,56 46,56 40,94 80,40 54,40" {...s} fill={C.paper} />,
    globe: (
      <>
        <circle cx={50} cy={50} r={40} {...s} fill={C.paper} />
        <ellipse cx={50} cy={50} rx={18} ry={40} {...s} />
        <line x1={10} y1={50} x2={90} y2={50} {...s} />
      </>
    ),
    card: (
      <>
        <rect x={8} y={22} width={84} height={58} rx={10} {...s} fill={C.paper} />
        <line x1={8} y1={40} x2={92} y2={40} {...s} />
        <line x1={20} y1={64} x2={40} y2={64} {...s} />
      </>
    ),
    facebook: (
      <>
        <rect x={10} y={10} width={80} height={80} rx={20} {...s} fill={C.paper} />
        <path d="M58 88 V52 H70 L72 40 H58 V32 Q58 26 64 26 H72 V14 Q66 13 60 13 Q46 13 46 28 V40 H34 V52 H46 V88" {...s} />
      </>
    ),
    instagram: (
      <>
        <rect x={10} y={10} width={80} height={80} rx={24} {...s} fill={C.paper} />
        <circle cx={50} cy={50} r={18} {...s} />
        <circle cx={72} cy={28} r={4} fill={color} />
      </>
    ),
    user: (
      <>
        <circle cx={50} cy={34} r={20} {...s} fill={C.paper} />
        <path d="M14 90 Q14 62 50 62 Q86 62 86 90" {...s} fill={C.paper} />
      </>
    ),
    upload: (
      <>
        <polyline points="30,40 50,20 70,40" {...s} />
        <line x1={50} y1={20} x2={50} y2={66} {...s} />
        <polyline points="14,62 14,84 86,84 86,62" {...s} />
      </>
    ),
    search: (
      <>
        <circle cx={42} cy={42} r={28} {...s} fill={C.paper} />
        <line x1={63} y1={63} x2={88} y2={88} {...s} />
      </>
    ),
    megaphone: (
      <>
        <path d="M14 40 L62 18 V82 L14 60 Z" {...s} fill={C.paper} />
        <path d="M26 62 L32 86 H44 L40 66" {...s} />
        <path d="M74 36 Q86 50 74 64" {...s} />
      </>
    ),
    check: (
      <>
        <circle cx={50} cy={50} r={40} {...s} fill={C.paper} />
        <polyline points="32,52 45,64 70,38" {...s} />
      </>
    ),
    star: <polygon points="50,8 61,36 92,38 68,58 76,88 50,72 24,88 32,58 8,38 39,36" {...s} fill={C.paper} />,
    key: (
      <>
        <circle cx={30} cy={50} r={18} {...s} fill={C.paper} />
        <polyline points="48,50 90,50 90,64" {...s} />
        <line x1={74} y1={50} x2={74} y2={62} {...s} />
      </>
    ),
    list: (
      <>
        {[24, 50, 76].map((y) => (
          <React.Fragment key={y}>
            <circle cx={16} cy={y} r={6} fill={color} />
            <line x1={32} y1={y} x2={88} y2={y} {...s} />
          </React.Fragment>
        ))}
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {paths[name]}
    </svg>
  );
};

const pop = (frame: number, fps: number, delay: number) =>
  spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 140 } });

const card: React.CSSProperties = {
  background: C.paper,
  border: `3px solid ${C.line}`,
  borderRadius: 32,
  boxShadow: "0 18px 40px rgba(20,37,77,0.08)",
};

const Tick: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <circle cx={20} cy={20} r={19} fill={C.green} />
    <polyline points="11,21 17,27 29,14" fill="none" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A row of up to four icon cards; `pick` (0-based) lifts one after a beat. */
export const CardsVisual: React.FC<{ items: Array<{ icon: IconName; label: string; coral?: boolean }>; pick?: number }> = ({
  items,
  pick,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const narrow = items.length > 3;
  return (
    <div style={{ display: "flex", gap: 26 }}>
      {items.map((it, i) => {
        const s = pop(f, fps, 14 + i * 9);
        const active = pick === i && f > 100;
        return (
          <div
            key={it.label}
            style={{
              ...card,
              width: narrow ? 220 : 260,
              height: narrow ? 230 : 250,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 22,
              borderColor: active ? C.coral : C.line,
              transform: `scale(${s * (active ? 1.06 : 1)}) translateY(${active ? -8 : 0}px)`,
            }}
          >
            <Icon name={it.icon} color={it.coral ? C.coral : C.navy} size={narrow ? 80 : 92} />
            <div style={{ fontFamily: SANS, fontWeight: W.medium, fontSize: narrow ? 26 : 30, color: C.ink, textAlign: "center", padding: "0 12px" }}>
              {it.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Pills joined by arrows that light up in turn; the last one goes green. */
export const FlowVisual: React.FC<{ steps: string[] }> = ({ steps }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const gap = Math.max(18, Math.round(90 / steps.length));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", maxWidth: 1060, rowGap: 22 }}>
      {steps.map((label, i) => {
        const at = 18 + i * gap;
        const on = f > at;
        const last = i === steps.length - 1;
        // Arrow + pill travel together so a wrapped row never ends on a dangling arrow.
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {i > 0 ? (
              <svg width={36} height={24} viewBox="0 0 44 24">
                <polyline points="2,12 38,12 28,3 38,12 28,21" fill="none" stroke={C.coral} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "22px 32px",
                borderRadius: 999,
                fontFamily: SANS,
                fontWeight: W.heavy,
                fontSize: steps.length > 3 ? 30 : 36,
                background: on ? (last ? C.green : C.navy) : C.paper,
                color: on ? "#fff" : C.muted,
                border: `3px solid ${on ? "transparent" : C.line}`,
                transform: `scale(${0.9 + 0.1 * pop(f, fps, at)})`,
              }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** A short text exchange. `from: "lead"` sits left, `"zack"` right in navy. */
export const ChatVisual: React.FC<{ messages: Array<{ from: "lead" | "zack"; text: string }>; stamp?: string }> = ({
  messages,
  stamp,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ ...card, width: 820, padding: "30px 34px", display: "flex", flexDirection: "column", gap: 18 }}>
      {messages.map((m, i) => {
        const s = pop(f, fps, 14 + i * 26);
        const zack = m.from === "zack";
        return (
          <div
            key={i}
            style={{
              alignSelf: zack ? "flex-end" : "flex-start",
              maxWidth: 600,
              padding: "18px 26px",
              borderRadius: 28,
              borderBottomRightRadius: zack ? 8 : 28,
              borderBottomLeftRadius: zack ? 28 : 8,
              background: zack ? C.navy : C.cream,
              color: zack ? "#fff" : C.ink,
              fontFamily: SANS,
              fontWeight: W.regular,
              fontSize: 30,
              lineHeight: 1.3,
              opacity: s,
              transform: `translateY(${(1 - s) * 20}px)`,
            }}
          >
            {m.text}
          </div>
        );
      })}
      {stamp ? (
        <div style={{ alignSelf: "flex-end", fontFamily: SANS, fontSize: 22, color: C.green, fontWeight: W.medium, opacity: pop(f, fps, 14 + messages.length * 26) }}>
          {stamp}
        </div>
      ) : null}
    </div>
  );
};

/** One labelled field; `highlight` is underlined in coral after a beat. */
export const FieldVisual: React.FC<{ label: string; value: string; highlight?: string }> = ({ label, value, highlight }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(f, fps, 14);
  const sweep = interpolate(f, [60, 85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const idx = highlight ? value.indexOf(highlight) : -1;
  const before = idx >= 0 ? value.slice(0, idx) : value;
  const mid = idx >= 0 ? highlight! : "";
  const after = idx >= 0 ? value.slice(idx + mid.length) : "";
  return (
    <div style={{ ...card, padding: "40px 56px", transform: `scale(${s})`, transformOrigin: "left center" }}>
      <div style={{ fontFamily: SANS, fontSize: 28, color: C.muted, marginBottom: 12 }}>{label}</div>
      <div style={{ fontFamily: SANS, fontSize: 64, fontWeight: W.medium, color: C.ink, letterSpacing: -1 }}>
        {before}
        {mid ? (
          <span style={{ position: "relative", color: sweep > 0.5 ? C.coral : C.ink }}>
            {mid}
            <span style={{ position: "absolute", left: 0, bottom: 2, height: 12, width: `${sweep * 100}%`, background: C.coral, opacity: 0.25, borderRadius: 6 }} />
          </span>
        ) : null}
        {after}
      </div>
    </div>
  );
};

/** Checklist card: `done` items ticked, the next one flagged. */
export const ChecklistVisual: React.FC<{ items: string[]; done: number; footer?: string }> = ({ items, done, footer }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ ...card, padding: "30px 42px", width: 680 }}>
      {items.map((label, i) => {
        const s = pop(f, fps, 10 + i * 5);
        const checked = i < done;
        const current = i === done;
        return (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "11px 0",
              opacity: s,
              transform: `translateX(${(1 - s) * 30}px)`,
              fontFamily: SANS,
              fontSize: 30,
              fontWeight: current ? W.heavy : W.medium,
              color: checked ? C.muted : current ? C.ink : "#A9B1C4",
            }}
          >
            {checked ? (
              <Tick size={36} />
            ) : (
              <span style={{ width: 36, height: 36, borderRadius: 18, border: `4px solid ${current ? C.coral : C.line}` }} />
            )}
            <span style={{ textDecoration: checked ? "line-through" : "none" }}>{label}</span>
            {current ? <span style={{ marginLeft: "auto", fontSize: 22, color: C.coral, fontWeight: W.heavy }}>NEXT</span> : null}
          </div>
        );
      })}
      {footer ? (
        <div style={{ marginTop: 14, paddingTop: 16, borderTop: `3px solid ${C.line}`, fontFamily: SANS, fontSize: 24, color: C.muted }}>{footer}</div>
      ) : null}
    </div>
  );
};

/** A kanban strip with one deal card travelling across the columns. */
export const PipelineVisual: React.FC<{ stages: string[]; deal: string }> = ({ stages, deal }) => {
  const f = useCurrentFrame();
  const colW = Math.floor(1040 / stages.length) - 14;
  const pos = interpolate(f, [30, 30 + 26 * (stages.length - 1)], [0, stages.length - 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const settled = pos >= stages.length - 1;
  return (
    <div style={{ position: "relative", display: "flex", gap: 14 }}>
      {stages.map((st, i) => (
        <div key={st} style={{ width: colW, height: 250, borderRadius: 24, background: i === stages.length - 1 ? "#E4F3EC" : C.paper, border: `3px solid ${C.line}`, padding: 16 }}>
          <div style={{ fontFamily: SANS, fontWeight: W.heavy, fontSize: 22, color: C.muted }}>{st}</div>
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          top: 70,
          left: 16 + pos * (colW + 14),
          width: colW - 32,
          padding: "16px 14px",
          borderRadius: 18,
          background: settled ? C.green : C.navy,
          color: "#fff",
          fontFamily: SANS,
          fontWeight: W.medium,
          fontSize: 22,
          boxShadow: "0 12px 24px rgba(20,37,77,0.2)",
        }}
      >
        {deal}
      </div>
    </div>
  );
};

/** Big countdown ring for "within N seconds" moments. */
export const TimerVisual: React.FC<{ seconds: number; label: string }> = ({ seconds, label }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [15, 105], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const left = Math.ceil(seconds * (1 - t));
  const r = 110;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 46 }}>
      <svg width={260} height={260} viewBox="0 0 260 260">
        <circle cx={130} cy={130} r={r} fill={C.paper} stroke={C.line} strokeWidth={18} />
        <circle
          cx={130}
          cy={130}
          r={r}
          fill="none"
          stroke={t >= 1 ? C.green : C.coral}
          strokeWidth={18}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={t >= 1 ? 0 : circ * t}
          transform="rotate(-90 130 130)"
        />
        {t >= 1 ? (
          <polyline points="92,132 118,158 170,104" fill="none" stroke={C.green} strokeWidth={18} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <text x={130} y={152} textAnchor="middle" fontFamily="Geist" fontWeight={800} fontSize={64} fill={C.ink}>
            {`${left}s`}
          </text>
        )}
      </svg>
      <div style={{ fontFamily: SANS, fontWeight: W.medium, fontSize: 36, color: C.ink, maxWidth: 420 }}>{label}</div>
    </div>
  );
};

/** The setup progress pill as it appears in the app. */
export const PillVisual: React.FC<{ from: string; to: string; count?: [number, number] }> = ({ from, to, count = [1, 6] }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const done = f > 50;
  const enter = pop(f, fps, 10);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "24px 38px",
        borderRadius: 999,
        ...card,
        fontFamily: SANS,
        transform: `translateY(${(1 - enter) * 40}px)`,
        opacity: enter,
      }}
    >
      <span style={{ background: C.coralSoft, color: C.coral, fontWeight: W.heavy, fontSize: 30, padding: "8px 20px", borderRadius: 999 }}>
        {done ? count[0] + 1 : count[0]} of {count[1]}
      </span>
      <span style={{ fontSize: 34, fontWeight: W.medium, color: C.ink }}>{done ? to : from}</span>
      <span style={{ transform: `scale(${pop(f, fps, 50)})`, display: "flex" }}>
        <Tick size={44} />
      </span>
    </div>
  );
};

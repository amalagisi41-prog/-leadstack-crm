import React from "react";
import { useCurrentFrame } from "remotion";
import { C } from "../brand";

/**
 * Hand-built scene illustrations in the AgentStack home page's style: warm
 * peach sky, soft sun, drifting clouds, rounded trees, a modern house, and
 * devices on a lavender table. Original vector art drawn for these videos —
 * the marketing slides are only the style reference. Each is 960×720 (4:3)
 * and gently animated.
 */

export type SceneName =
  | "new-lead"
  | "ai-receptionist"
  | "leads"
  | "booking-phone"
  | "realtor-house"
  | "analytics"
  | "dashboard"
  | "city";

const P = {
  skyTop: "#FBE3D6",
  skyBottom: "#FFF4EC",
  blush: "#F9C9C0",
  sun: "#F6A25B",
  cloud: "#FFFFFF",
  cloudShade: "#E7DDF0",
  lilac: "#C9B8E6",
  lavender: "#CDBFEA",
  lavenderDark: "#A995D8",
  green: "#3E8F5E",
  greenLight: "#6DB27E",
  greenDark: "#2C6B47",
  trunk: "#8A6248",
  wall: "#FFFFFF",
  glass: "#2B3F6B",
  wood: "#B9835C",
  teal: "#3E7C7A",
  grey: "#D9D4E2",
};

const Defs: React.FC = () => (
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={P.skyTop} />
      <stop offset="1" stopColor={P.skyBottom} />
    </linearGradient>
    <linearGradient id="table" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={P.lavender} />
      <stop offset="1" stopColor={P.lavenderDark} />
    </linearGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#24365E" />
      <stop offset="1" stopColor="#1A2747" />
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stopColor={P.blush} stopOpacity="0.9" />
      <stop offset="1" stopColor={P.blush} stopOpacity="0" />
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#14254D" floodOpacity="0.18" />
    </filter>
  </defs>
);

const Cloud: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx={0} cy={10} rx={70} ry={22} fill={P.cloudShade} />
    <ellipse cx={-28} cy={0} rx={34} ry={26} fill={P.cloud} />
    <ellipse cx={10} cy={-12} rx={40} ry={34} fill={P.cloud} />
    <ellipse cx={46} cy={2} rx={30} ry={22} fill={P.cloud} />
  </g>
);

const Birds: React.FC<{ x: number; y: number }> = ({ x, y }) => {
  const f = useCurrentFrame();
  const flap = Math.sin(f / 5) * 4;
  return (
    <g transform={`translate(${x + f * 0.4} ${y})`} fill="none" stroke="#7A6F8E" strokeWidth={3} strokeLinecap="round">
      <path d={`M0 0 Q8 ${-6 - flap} 16 0 Q24 ${-6 - flap} 32 0`} />
      <path d={`M44 18 Q50 ${13 - flap} 56 18 Q62 ${13 - flap} 68 18`} />
    </g>
  );
};

const Tree: React.FC<{ x: number; y: number; s?: number; tone?: "light" | "dark" }> = ({ x, y, s = 1, tone = "light" }) => {
  const f = useCurrentFrame();
  const sway = Math.sin((f + x) / 40) * 1.5;
  const main = tone === "light" ? P.greenLight : P.green;
  const shade = tone === "light" ? P.green : P.greenDark;
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${sway})`}>
      <rect x={-6} y={-10} width={12} height={60} rx={5} fill={P.trunk} />
      <circle cx={0} cy={-50} r={52} fill={shade} />
      <circle cx={-22} cy={-62} r={36} fill={main} />
      <circle cx={20} cy={-74} r={32} fill={main} />
      <circle cx={4} cy={-36} r={34} fill={main} opacity={0.85} />
    </g>
  );
};

const Hills: React.FC<{ y: number }> = ({ y }) => (
  <g>
    <path d={`M0 ${y} Q240 ${y - 70} 480 ${y - 10} T960 ${y - 30} V720 H0 Z`} fill="#BFD9B8" />
    <path d={`M0 ${y + 40} Q300 ${y - 10} 600 ${y + 30} T960 ${y + 10} V720 H0 Z`} fill="#9CC79C" />
  </g>
);

const Skyline: React.FC<{ y: number; opacity?: number }> = ({ y, opacity = 0.55 }) => (
  <g fill={P.lilac} opacity={opacity}>
    {[
      [120, 90, 46],
      [172, 130, 38],
      [214, 70, 52],
      [700, 110, 40],
      [746, 160, 46],
      [798, 96, 40],
    ].map(([x, h, w]) => (
      <rect key={x} x={x} y={y - h} width={w} height={h} rx={4} />
    ))}
  </g>
);

const House: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#soft)">
    <rect x={0} y={60} width={300} height={150} rx={6} fill={P.wall} />
    <rect x={180} y={0} width={190} height={120} rx={6} fill={P.wall} />
    <rect x={-10} y={50} width={320} height={16} rx={4} fill="#EDE6EF" />
    <rect x={170} y={-10} width={210} height={16} rx={4} fill="#EDE6EF" />
    <rect x={200} y={22} width={150} height={70} rx={4} fill={P.glass} />
    <line x1={275} y1={22} x2={275} y2={92} stroke="#5A6E99" strokeWidth={4} />
    <rect x={30} y={90} width={110} height={110} rx={4} fill="#3A4A6E" />
    {[0, 1, 2, 3].map((i) => (
      <line key={i} x1={30} y1={104 + i * 26} x2={140} y2={104 + i * 26} stroke="#55668C" strokeWidth={3} />
    ))}
    <rect x={160} y={110} width={46} height={100} rx={3} fill={P.wood} />
    <rect x={226} y={130} width={60} height={50} rx={3} fill={P.glass} />
  </g>
);

const Sun: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 70 }) => {
  const f = useCurrentFrame();
  return (
    <g>
      <circle cx={x} cy={y} r={r * 1.7 + Math.sin(f / 20) * 4} fill="url(#glow)" />
      <circle cx={x} cy={y} r={r} fill={P.sun} />
    </g>
  );
};

const Sky: React.FC<{ sun?: [number, number]; birds?: boolean }> = ({ sun, birds }) => {
  const f = useCurrentFrame();
  const drift = f * 0.25;
  return (
    <g>
      <rect width={960} height={720} fill="url(#sky)" />
      {sun ? <Sun x={sun[0]} y={sun[1]} /> : null}
      <Cloud x={180 + drift} y={120} s={0.9} />
      <Cloud x={620 + drift * 0.6} y={80} s={0.7} />
      {birds ? <Birds x={360} y={150} /> : null}
    </g>
  );
};

/** Indoor backdrop: warm wall, soft coral halo, lavender table edge. */
const Room: React.FC<{ tableY?: number; window?: boolean }> = ({ tableY = 520, window = true }) => (
  <g>
    <rect width={960} height={720} fill="#FFF1E8" />
    <circle cx={470} cy={300} r={260} fill={P.blush} opacity={0.55} />
    {window ? (
      <g>
        <rect x={760} y={-10} width={220} height={tableY + 10} fill="url(#sky)" />
        <Tree x={850} y={tableY - 40} s={0.9} />
        <rect x={812} y={tableY - 150} width={160} height={110} rx={4} fill={P.wall} />
        <rect x={830} y={tableY - 130} width={54} height={40} rx={3} fill={P.glass} />
        <rect x={748} y={-10} width={18} height={tableY + 10} fill={C.ink} />
        <rect x={732} y={tableY - 260} width={10} height={70} rx={5} fill="#C9A15E" />
      </g>
    ) : null}
    <path d={`M0 ${tableY} L960 ${tableY - 40} V720 H0 Z`} fill="url(#table)" />
  </g>
);

const Plant: React.FC<{ x: number; y: number; s?: number }> = ({ x, y, s = 1 }) => {
  const f = useCurrentFrame();
  const sway = Math.sin(f / 30) * 2;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g transform={`rotate(${sway} 0 -10)`}>
        {[-55, -25, 0, 25, 55].map((a, i) => (
          <ellipse
            key={a}
            cx={0}
            cy={-90}
            rx={22}
            ry={64}
            fill={i % 2 ? P.green : P.greenDark}
            transform={`rotate(${a} 0 -10)`}
          />
        ))}
      </g>
      <path d="M-46 -12 H46 L36 70 Q34 80 24 80 H-24 Q-34 80 -36 70 Z" fill="#E8DCCB" />
    </g>
  );
};

const Mug: React.FC<{ x: number; y: number; color?: string }> = ({ x, y, color = P.teal }) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M58 20 Q92 20 92 46 Q92 72 56 70" fill="none" stroke={color} strokeWidth={14} />
    <rect x={-6} y={0} width={72} height={92} rx={14} fill={color} />
    <rect x={-6} y={64} width={72} height={28} rx={10} fill="#EADFCF" />
    <ellipse cx={30} cy={4} rx={36} ry={8} fill="#3B2A22" />
  </g>
);

const Bar: React.FC<{ x: number; y: number; w: number; h?: number; color?: string }> = ({ x, y, w, h = 12, color = P.grey }) => (
  <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={color} />
);

const Check: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 16 }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill={C.green} />
    <polyline
      points={`${x - r * 0.45},${y} ${x - r * 0.1},${y + r * 0.35} ${x + r * 0.5},${y - r * 0.35}`}
      fill="none"
      stroke="#fff"
      strokeWidth={r * 0.28}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </g>
);

const HouseBadge: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 22 }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill={C.coral} />
    <polyline points={`${x - 10},${y + 1} ${x},${y - 9} ${x + 10},${y + 1}`} fill="none" stroke="#fff" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
    <rect x={x - 7} y={y} width={14} height={10} rx={2} fill="none" stroke="#fff" strokeWidth={3} />
  </g>
);

/* ------------------------------ scenes ------------------------------ */

const NewLead: React.FC = () => {
  const f = useCurrentFrame();
  const ping = Math.min(1, Math.max(0, (f - 20) / 12));
  return (
    <g>
      <Room />
      <Plant x={610} y={430} s={1.05} />
      <Mug x={120} y={470} />
      <g transform="translate(330 120) rotate(-6)" filter="url(#soft)">
        <rect x={0} y={0} width={240} height={440} rx={36} fill="#1A2440" />
        <rect x={10} y={10} width={220} height={420} rx={28} fill="url(#screen)" />
        <rect x={86} y={22} width={68} height={16} rx={8} fill="#0F1830" />
        <text x={120} y={120} textAnchor="middle" fontFamily="Geist" fontWeight={300} fontSize={52} fill="#fff">
          10:21
        </text>
        <g transform={`translate(0 ${(1 - ping) * 30})`} opacity={ping}>
          <rect x={22} y={190} width={196} height={130} rx={20} fill="#FFFDF9" />
          <HouseBadge x={52} y={222} r={18} />
          <Bar x={78} y={214} w={90} h={14} color={C.ink} />
          <Bar x={36} y={256} w={150} />
          <Bar x={36} y={282} w={110} />
        </g>
      </g>
      <g transform="translate(560 600) rotate(-20)">
        <circle cx={0} cy={0} r={18} fill="none" stroke="#C9A15E" strokeWidth={7} />
        <rect x={14} y={-6} width={70} height={12} rx={4} fill="#C9A15E" />
        <rect x={-70} y={-16} width={56} height={32} rx={12} fill={C.ink} />
      </g>
    </g>
  );
};

const AiReceptionist: React.FC = () => {
  const f = useCurrentFrame();
  const show = (i: number) => Math.min(1, Math.max(0, (f - 15 - i * 18) / 10));
  return (
    <g>
      <Room window={false} tableY={560} />
      <Plant x={130} y={500} s={0.95} />
      <Mug x={760} y={520} color={C.ink} />
      <g transform="translate(560 260)" filter="url(#soft)">
        <path d="M0 0 H300 L330 290 H-30 Z" fill="#2A3657" />
        <rect x={14} y={14} width={272} height={240} rx={8} fill="url(#screen)" />
      </g>
      <g transform="translate(250 90)" filter="url(#soft)">
        <rect x={0} y={0} width={380} height={420} rx={28} fill="#FFFDF9" />
        <rect x={0} y={0} width={380} height={64} rx={28} fill={C.ink} />
        <rect x={0} y={36} width={380} height={28} fill={C.ink} />
        <circle cx={36} cy={32} r={9} fill="#fff" />
        <Bar x={58} y={26} w={120} h={12} color="#fff" />
        <circle cx={340} cy={32} r={6} fill="#5BD08A" />
        {[
          { y: 90, me: false, w: 230 },
          { y: 190, me: true, w: 200 },
          { y: 280, me: false, w: 240 },
        ].map((b, i) => (
          <g key={i} opacity={show(i)} transform={`translate(0 ${(1 - show(i)) * 14})`}>
            {!b.me ? (
              <g>
                <circle cx={40} cy={b.y + 22} r={18} fill={C.ink} />
                <rect x={30} y={b.y + 16} width={20} height={14} rx={4} fill="#fff" />
              </g>
            ) : null}
            <rect x={b.me ? 340 - b.w : 70} y={b.y} width={b.w} height={78} rx={18} fill={b.me ? C.coralSoft : "#F1ECF6"} />
            <Bar x={(b.me ? 340 - b.w : 70) + 18} y={b.y + 22} w={b.w - 60} />
            <Bar x={(b.me ? 340 - b.w : 70) + 18} y={b.y + 46} w={b.w - 100} />
          </g>
        ))}
        <rect x={22} y={372} width={336} height={34} rx={17} fill="#F1ECF6" />
        <circle cx={340} cy={389} r={14} fill={C.coral} />
      </g>
    </g>
  );
};

const Leads: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <g>
      <Room window={false} tableY={600} />
      <Plant x={820} y={540} s={0.9} />
      <g transform="translate(150 90)" filter="url(#soft)">
        <rect x={0} y={0} width={600} height={400} rx={20} fill="#2A3657" />
        <rect x={16} y={16} width={568} height={368} rx={10} fill="#FFFDF9" />
        <rect x={16} y={16} width={120} height={368} fill={C.ink} />
        {[60, 100, 140, 180].map((y) => (
          <Bar key={y} x={36} y={y} w={70} h={10} color="#4D5E87" />
        ))}
        <Bar x={160} y={40} w={120} h={18} color={C.ink} />
        <rect x={480} y={36} width={80} height={26} rx={13} fill={C.coral} />
        {[0, 1, 2, 3, 4].map((i) => {
          const o = Math.min(1, Math.max(0, (f - 10 - i * 8) / 10));
          const pills = [C.coral, "#7AA6E8", C.green, "#B48CE0", "#F0B35B"];
          return (
            <g key={i} opacity={o} transform={`translate(${(1 - o) * 20} ${82 + i * 58})`}>
              <circle cx={180} cy={22} r={18} fill={["#E8B9A0", "#B98A6E", "#D9A88A", "#8A6248", "#F0C8A8"][i]} />
              <Bar x={210} y={10} w={140} h={12} color={C.ink} />
              <Bar x={210} y={30} w={100} h={9} />
              <rect x={400} y={10} width={64} height={22} rx={11} fill={pills[i]} opacity={0.85} />
              <Bar x={490} y={16} w={60} h={9} />
            </g>
          );
        })}
      </g>
      <path d="M110 490 H790 L830 520 H70 Z" fill="#3A466A" />
      <Mug x={70} y={560} color={C.ink} />
    </g>
  );
};

const BookingPhone: React.FC = () => {
  const f = useCurrentFrame();
  const picked = f > 40;
  return (
    <g>
      <Sky sun={[820, 130]} />
      <Hills y={560} />
      <House x={520} y={330} s={0.95} />
      <Tree x={480} y={560} s={1.1} tone="dark" />
      <Tree x={900} y={570} s={1.2} />
      <g transform="translate(110 70)" filter="url(#soft)">
        <rect x={0} y={0} width={320} height={600} rx={44} fill="#1A2440" />
        <rect x={12} y={12} width={296} height={576} rx={34} fill="#FFFDF9" />
        <rect x={120} y={26} width={80} height={20} rx={10} fill="#1A2440" />
        <Bar x={110} y={74} w={100} h={14} color={C.ink} />
        {Array.from({ length: 30 }).map((_, i) => {
          const cx = 50 + (i % 6) * 44;
          const cy = 130 + Math.floor(i / 6) * 42;
          const sel = i === 19 && picked;
          return (
            <g key={i}>
              {sel ? <circle cx={cx} cy={cy} r={17} fill={C.coral} /> : null}
              <circle cx={cx} cy={cy} r={4} fill={sel ? "#fff" : "#B8B2C6"} />
            </g>
          );
        })}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect
              x={34}
              y={360 + i * 66}
              width={252}
              height={50}
              rx={14}
              fill={i === 0 && picked ? C.coral : "#FFFDF9"}
              stroke={i === 0 && picked ? C.coral : "#E5DCEA"}
              strokeWidth={3}
            />
            <Bar x={120} y={379 + i * 66} w={80} h={12} color={i === 0 && picked ? "#fff" : "#C7C0D3"} />
            {i === 0 && picked ? <Check x={258} y={385} r={13} /> : null}
          </g>
        ))}
      </g>
    </g>
  );
};

const RealtorHouse: React.FC = () => (
  <g>
    <Sky sun={[640, 140]} birds />
    <Skyline y={440} />
    <Hills y={470} />
    <Tree x={120} y={520} s={1.4} tone="dark" />
    <House x={170} y={300} s={1.05} />
    <Tree x={560} y={540} s={1.2} />
    <rect x={0} y={600} width={960} height={120} fill="#8DBB8E" />
    <path d="M330 720 L380 520 H420 L470 720 Z" fill="#E9DFD2" />
    <g transform="translate(600 300)">
      <path d="M40 420 Q30 230 150 200 Q270 230 270 420 Z" fill="#2F4B3A" />
      <path d="M150 200 L130 260 L150 300 L170 260 Z" fill="#E9E2D8" />
      <rect x={128} y={150} width={46} height={64} rx={18} fill="#C68E6B" />
      <ellipse cx={150} cy={110} rx={62} ry={70} fill="#C68E6B" />
      <path d="M88 110 Q84 30 150 36 Q216 30 212 106 Q196 78 150 76 Q104 78 88 110 Z" fill="#2A1E1A" />
      <path d="M180 140 Q206 160 196 196 Q176 186 168 160 Z" fill="#2A1E1A" opacity={0.85} />
      <g transform="translate(20 250) rotate(-14)" filter="url(#soft)">
        <rect x={0} y={0} width={190} height={130} rx={14} fill="#1A2440" />
        <rect x={8} y={8} width={174} height={114} rx={8} fill="#FFFDF9" />
        <rect x={18} y={20} width={70} height={40} rx={6} fill="#F1ECF6" />
        <rect x={98} y={20} width={70} height={40} rx={6} fill="#F1ECF6" />
        <Bar x={18} y={74} w={120} h={8} />
        <Bar x={18} y={92} w={90} h={8} />
        <rect x={140} y={70} width={30} height={12} rx={6} fill={C.coral} opacity={0.7} />
      </g>
      <ellipse cx={70} cy={330} rx={30} ry={22} fill="#C68E6B" />
    </g>
  </g>
);

const Analytics: React.FC = () => {
  const f = useCurrentFrame();
  const draw = Math.min(1, Math.max(0, (f - 10) / 40));
  const card = (x: number, y: number, w: number, h: number, children: React.ReactNode) => (
    <g transform={`translate(${x} ${y})`} filter="url(#soft)">
      <rect width={w} height={h} rx={22} fill="#FFFDF9" />
      {children}
    </g>
  );
  const linePts = [0, 30, 22, 60, 50, 92, 120, 110, 170].map((v, i) => `${30 + i * 42},${200 - v * draw}`).join(" ");
  return (
    <g>
      <Sky sun={[860, 110]} />
      <Hills y={600} />
      <Tree x={70} y={650} s={1.1} tone="dark" />
      <Tree x={900} y={660} s={1.0} />
      {card(60, 120, 420, 250, (
        <g>
          <Bar x={30} y={30} w={90} h={12} color={C.muted} />
          <polyline points={linePts} fill="none" stroke="#7C5CD6" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      {card(510, 120, 360, 250, (
        <g>
          <circle cx={110} cy={130} r={70} fill="none" stroke="#E6DFF2" strokeWidth={30} />
          <circle
            cx={110}
            cy={130}
            r={70}
            fill="none"
            stroke="#7C5CD6"
            strokeWidth={30}
            strokeDasharray={`${440 * 0.45 * draw} 440`}
            transform="rotate(-90 110 130)"
          />
          <circle
            cx={110}
            cy={130}
            r={70}
            fill="none"
            stroke={C.coral}
            strokeWidth={30}
            strokeDasharray={`0 ${440 * 0.45} ${440 * 0.3 * draw} 440`}
            transform="rotate(-90 110 130)"
          />
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <circle cx={222} cy={96 + i * 34} r={8} fill={["#7C5CD6", C.coral, "#E6DFF2"][i]} />
              <Bar x={240} y={90 + i * 34} w={80} h={10} />
            </g>
          ))}
        </g>
      ))}
      {card(160, 400, 640, 180, (
        <g>
          {[100, 72, 52, 36, 22, 12].map((v, i) => (
            <rect
              key={i}
              x={50 + i * 95}
              y={150 - v * draw}
              width={56}
              height={v * draw}
              rx={8}
              fill={["#7C5CD6", "#9A6BE0", "#C26BD6", "#E86AA8", "#F07F8A", "#F6A2A0"][i]}
            />
          ))}
        </g>
      ))}
    </g>
  );
};

const Dashboard: React.FC = () => {
  const f = useCurrentFrame();
  const o = (i: number) => Math.min(1, Math.max(0, (f - 10 - i * 6) / 10));
  return (
    <g>
      <Room tableY={560} />
      <Plant x={110} y={500} s={1} />
      <g transform="translate(200 90)" filter="url(#soft)">
        <rect x={0} y={0} width={540} height={420} rx={30} fill="#1A2440" />
        <rect x={16} y={16} width={508} height={388} rx={18} fill="#FFFDF9" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} opacity={o(i)}>
            <rect x={36 + i * 120} y={36} width={106} height={80} rx={12} fill="#F4EFF8" />
            <Bar x={50 + i * 120} y={52} w={50} h={8} />
            <Bar x={50 + i * 120} y={72} w={60} h={16} color={C.ink} />
            <Bar x={50 + i * 120} y={98} w={34} h={7} color={C.green} />
          </g>
        ))}
        {[0, 1, 2, 3].map((i) => (
          <g key={i} opacity={o(i + 4)}>
            <rect x={40} y={150 + i * 56} width={22} height={22} rx={6} fill="none" stroke="#C7C0D3" strokeWidth={3} />
            {i < 2 ? <polyline points={`${45},${161 + i * 56} ${50},${167 + i * 56} ${58},${155 + i * 56}`} fill="none" stroke={C.green} strokeWidth={4} strokeLinecap="round" /> : null}
            <Bar x={76} y={155 + i * 56} w={170 - i * 20} h={11} />
            <rect x={262} y={152 + i * 56} width={44} height={18} rx={9} fill={[C.coral, "#F0B35B", "#7AA6E8", C.green][i]} opacity={0.7} />
          </g>
        ))}
        <g opacity={o(9)}>
          <rect x={330} y={146} width={174} height={238} rx={14} fill="#F4EFF8" />
          <rect x={344} y={160} width={146} height={100} rx={10} fill="#3A4A6E" />
          <path d="M356 236 L390 200 L420 222 L450 190 L478 236 Z" fill="#6E7FA8" />
          <rect x={404} y={214} width={30} height={22} fill="#F6C87A" />
          <Bar x={344} y={276} w={100} h={12} color={C.ink} />
          <Bar x={344} y={300} w={130} h={9} />
          <Bar x={344} y={320} w={90} h={9} />
        </g>
      </g>
      <g transform="translate(790 600) rotate(-12)">
        <circle cx={0} cy={0} r={16} fill="none" stroke="#C9A15E" strokeWidth={6} />
        <rect x={12} y={-5} width={60} height={10} rx={4} fill="#C9A15E" />
      </g>
    </g>
  );
};

const City: React.FC = () => {
  const towers: Array<[number, number, number, string]> = [
    [90, 260, 110, "#8E7CD8"],
    [210, 380, 90, "#B48CE0"],
    [310, 300, 120, "#F08A7E"],
    [440, 470, 110, "#7C66D0"],
    [560, 340, 100, "#E77C88"],
    [670, 420, 120, "#9A86DE"],
    [800, 280, 110, "#F0A08A"],
  ];
  return (
    <g>
      <Sky sun={[760, 120]} birds />
      {towers.map(([x, h, w, color]) => (
        <g key={x}>
          <rect x={x} y={560 - h} width={w} height={h} fill={color} />
          <rect x={x} y={560 - h} width={w * 0.35} height={h} fill="#000" opacity={0.07} />
          {Array.from({ length: Math.floor(h / 40) }).map((_, r) =>
            [0, 1, 2].map((c) => (
              <rect key={`${r}-${c}`} x={x + 16 + c * ((w - 32) / 3)} y={560 - h + 20 + r * 40} width={(w - 32) / 3 - 10} height={18} rx={3} fill="#FFFFFF" opacity={0.35} />
            )),
          )}
        </g>
      ))}
      <rect x={0} y={560} width={960} height={160} fill="#8D79D2" />
      <path d="M0 600 H960" stroke="#A797E0" strokeWidth={6} />
      <g transform="translate(330 520)">
        <rect x={0} y={0} width={420} height={36} fill="#F2A07E" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${20 + i * 135} 160 V70 Q${20 + i * 135 + 55} 10 ${20 + i * 135 + 110} 70 V160`} fill="#F2A07E" stroke="#E08A68" strokeWidth={4} />
        ))}
        <rect x={0} y={36} width={420} height={40} fill="#F2A07E" />
      </g>
      <Tree x={60} y={640} s={1.5} tone="dark" />
      <Tree x={210} y={660} s={1.2} />
      <Tree x={880} y={650} s={1.4} tone="dark" />
    </g>
  );
};

const SCENES: Record<SceneName, React.FC> = {
  "new-lead": NewLead,
  "ai-receptionist": AiReceptionist,
  leads: Leads,
  "booking-phone": BookingPhone,
  "realtor-house": RealtorHouse,
  analytics: Analytics,
  dashboard: Dashboard,
  city: City,
};

export const SceneIllustration: React.FC<{ name: SceneName }> = ({ name }) => {
  const Scene = SCENES[name];
  return (
    <svg width="100%" height="100%" viewBox="0 0 960 720" preserveAspectRatio="xMidYMid slice">
      <Defs />
      <Scene />
    </svg>
  );
};

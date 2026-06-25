import {
  ARCHITECTURE_ELEMENTS,
  type SimplifiedElement,
} from "./architecture-scene";

/**
 * Static SVG render of the LeadStack architecture tube-map for
 * /docs/architecture.
 *
 * Implemented as a server component that walks the same
 * `ARCHITECTURE_ELEMENTS` data structure the previous Excalidraw embed
 * consumed, so the file remains the single source of truth for the
 * diagram. To change what visitors see, edit `architecture-scene.ts`
 * and redeploy — no separate SVG artefact to keep in sync.
 *
 * Trade-off vs the previous live Excalidraw embed:
 *   - No pan/zoom (it's now an image).
 *   - Bundle weight drops from ~500KB (gzipped) to effectively zero.
 *   - First paint is server-rendered HTML, not a 600ms-wait spinner.
 *   - Screen readers + crawlers can introspect the labels via the
 *     embedded <title> / <desc> + per-line text.
 */

const ROUNDED_CORNERS = 10;
const FONT_STACK =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Arrow markers used by the dashed "lead flow" bridges. Each bridge inherits
// its colour from the tube line it conceptually originates on.
const ARROW_COLOURS: Record<string, string> = {
  red: "#ef4444",
  green: "#22c55e",
  amber: "#f59e0b",
};

function colourToMarkerId(stroke: string): string | undefined {
  if (stroke === ARROW_COLOURS.red) return "arrow-red";
  if (stroke === ARROW_COLOURS.green) return "arrow-green";
  if (stroke === ARROW_COLOURS.amber) return "arrow-amber";
  return undefined;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function ArrowMarkers() {
  return (
    <defs>
      {Object.entries(ARROW_COLOURS).map(([name, colour]) => (
        <marker
          key={name}
          id={`arrow-${name}`}
          markerWidth={10}
          markerHeight={10}
          refX={9}
          refY={3}
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill={colour} />
        </marker>
      ))}
    </defs>
  );
}

function RectElement({ el }: { el: SimplifiedElement }) {
  const x = num(el.x);
  const y = num(el.y);
  const w = num(el.width);
  const h = num(el.height);
  const fill = str(el.backgroundColor, "transparent");
  const stroke = str(el.strokeColor, "#1e1e1e");
  const strokeWidth = num(el.strokeWidth, 2);
  const label = el.label as
    | { text?: string; fontSize?: number }
    | undefined;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={ROUNDED_CORNERS}
        ry={ROUNDED_CORNERS}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {label?.text && (
        <text
          x={x + w / 2}
          y={y + h / 2}
          fontSize={num(label.fontSize, 16)}
          fontFamily={FONT_STACK}
          fontWeight={500}
          fill="#1e1e1e"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {label.text}
        </text>
      )}
    </g>
  );
}

function LineElement({ el }: { el: SimplifiedElement }) {
  const x1 = num(el.x);
  const y1 = num(el.y);
  const w = num(el.width);
  const h = num(el.height);
  const stroke = str(el.strokeColor, "#1e1e1e");
  const strokeWidth = num(el.strokeWidth, 1);
  const dashed = el.strokeStyle === "dashed";
  const opacityRaw = el.opacity;
  // Excalidraw opacity is 0–100; SVG expects 0–1.
  const opacity =
    typeof opacityRaw === "number" ? opacityRaw / 100 : 1;
  const hasArrow = el.endArrowhead === "arrow";
  const markerId = hasArrow ? colourToMarkerId(stroke) : undefined;

  return (
    <line
      x1={x1}
      y1={y1}
      x2={x1 + w}
      y2={y1 + h}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={dashed ? "12 6" : undefined}
      opacity={opacity}
      markerEnd={markerId ? `url(#${markerId})` : undefined}
    />
  );
}

function TextElement({ el }: { el: SimplifiedElement }) {
  const x = num(el.x);
  const y = num(el.y);
  const fontSize = num(el.fontSize, 16);
  const fill = str(el.strokeColor, "#1e1e1e");

  return (
    <text
      x={x}
      y={y}
      fontSize={fontSize}
      fontFamily={FONT_STACK}
      fill={fill}
      dominantBaseline="hanging"
    >
      {str(el.text)}
    </text>
  );
}

function EllipseElement({ el }: { el: SimplifiedElement }) {
  const x = num(el.x);
  const y = num(el.y);
  const w = num(el.width);
  const h = num(el.height);
  const fill = str(el.backgroundColor, "transparent");
  const stroke = str(el.strokeColor, "#1e1e1e");

  return (
    <ellipse
      cx={x + w / 2}
      cy={y + h / 2}
      rx={w / 2}
      ry={h / 2}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

function renderElement(el: SimplifiedElement, key: string) {
  switch (el.type) {
    case "rectangle":
      return <RectElement key={key} el={el} />;
    case "arrow":
      // Excalidraw's "arrow" element is used for both straight tube lines
      // (no arrowhead) and dashed lead-flow bridges (arrowhead). We render
      // both as <line> with optional marker-end and stroke-dasharray.
      return <LineElement key={key} el={el} />;
    case "text":
      return <TextElement key={key} el={el} />;
    case "ellipse":
      return <EllipseElement key={key} el={el} />;
    default:
      return null;
  }
}

export function ArchitectureDiagram() {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <svg
        viewBox="0 0 1200 920"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby="architecture-title architecture-desc"
        className="block h-auto w-full min-w-[900px]"
      >
        <title id="architecture-title">
          LeadStack architecture — eight product domains, one platform
        </title>
        <desc id="architecture-desc">
          Tube-map view of LeadStack&rsquo;s product surface. Eight
          horizontal coloured lines, each one product domain: Platform
          (slate, top), Capture (blue), AI Agents (purple), CRM (red, the
          central trunk), Sales (amber), Comms (green), Automation (pink),
          Public API (cyan, bottom). Stations along each line are labelled
          rounded rectangles for the features in that domain. Contact in
          the CRM line and Sub-Account in the Platform line have thicker
          borders to mark them as central interchanges — every line
          conceptually passes through them. Four dashed bridges show the
          lead lifecycle flow: Capture and AI Agents feed into Contact;
          Contact feeds into Comms and Sales. A legend strip at the bottom
          maps each colour to its domain name.
        </desc>
        <ArrowMarkers />
        {ARCHITECTURE_ELEMENTS.map((el, i) =>
          renderElement(el, `${str(el.id, String(i))}-${i}`),
        )}
      </svg>
    </div>
  );
}

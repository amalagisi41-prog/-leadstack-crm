/**
 * Architecture scene definition for /docs/architecture.
 *
 * Stored as a plain object array so the page renders deterministically
 * and the diagram is grep-able in source. The schema started life as
 * Excalidraw's "simplified element" shape (rectangles, arrows, text,
 * ellipses with x/y/width/height/colours), which is why some keys
 * (`endArrowhead`, `roundness`, opacity 0-100, etc.) read Excalidraw-ish.
 * Rendering now happens entirely server-side via the SVG renderer in
 * architecture-diagram.tsx — no Excalidraw dependency.
 *
 * Mirrors the tube-map design produced during the slice-9 retrospective:
 *   - Eight horizontal lines, each one product domain (CRM, Capture,
 *     AI Agents, Comms, Sales, Automation, Platform, Public API).
 *   - Stations as labelled rounded rectangles in line-themed colours.
 *   - Contact + Sub-Account drawn with thick borders as the central
 *     interchanges (every line conceptually passes through them).
 *   - Four dashed bridges showing the lead lifecycle flow between lines.
 *   - Legend strip at the bottom.
 *
 * To change what /docs/architecture displays, edit the elements here and
 * redeploy — there's no separate SVG artefact to keep in sync.
 */

export type SimplifiedElement = Record<string, unknown>;

export const ARCHITECTURE_ELEMENTS: SimplifiedElement[] = [
  // Title + subtitle
  { type: "text", id: "title", x: 315, y: 10, text: "LeadStack — eight lines, one platform", fontSize: 26, strokeColor: "#1e1e1e" },
  { type: "text", id: "sub", x: 230, y: 45, text: "Eight product domains. One sub-account. Everything an agency CRM needs.", fontSize: 18, strokeColor: "#757575" },

  // === Line 8: Platform (slate) ===
  { type: "arrow", id: "ln8", x: 135, y: 115, width: 930, height: 0, points: [[0, 0], [930, 0]], strokeColor: "#475569", strokeWidth: 5, endArrowhead: null },
  { type: "rectangle", id: "adm1", x: 70, y: 85, width: 130, height: 60, backgroundColor: "#cbd5e1", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#475569", label: { text: "Agency", fontSize: 18 } },
  { type: "rectangle", id: "adm2", x: 225, y: 85, width: 130, height: 60, backgroundColor: "#cbd5e1", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#475569", strokeWidth: 4, label: { text: "Sub-Account", fontSize: 18 } },
  { type: "rectangle", id: "adm3", x: 380, y: 85, width: 130, height: 60, backgroundColor: "#cbd5e1", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#475569", label: { text: "Members", fontSize: 18 } },
  { type: "rectangle", id: "adm4", x: 535, y: 85, width: 130, height: 60, backgroundColor: "#cbd5e1", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#475569", label: { text: "Roles", fontSize: 18 } },
  { type: "rectangle", id: "adm5", x: 690, y: 85, width: 130, height: 60, backgroundColor: "#cbd5e1", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#475569", label: { text: "Territories", fontSize: 18 } },
  { type: "rectangle", id: "adm6", x: 845, y: 85, width: 130, height: 60, backgroundColor: "#cbd5e1", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#475569", label: { text: "Gates", fontSize: 18 } },
  { type: "rectangle", id: "adm7", x: 1000, y: 85, width: 130, height: 60, backgroundColor: "#cbd5e1", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#475569", label: { text: "Billing", fontSize: 18 } },

  // === Line 2: Capture (blue) ===
  { type: "arrow", id: "ln2", x: 260, y: 200, width: 680, height: 0, points: [[0, 0], [680, 0]], strokeColor: "#4a9eed", strokeWidth: 5, endArrowhead: null },
  { type: "rectangle", id: "cap1", x: 195, y: 170, width: 130, height: 60, backgroundColor: "#a5d8ff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#4a9eed", label: { text: "Forms", fontSize: 18 } },
  { type: "rectangle", id: "cap2", x: 365, y: 170, width: 130, height: 60, backgroundColor: "#a5d8ff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#4a9eed", label: { text: "Web Chat", fontSize: 18 } },
  { type: "rectangle", id: "cap3", x: 535, y: 170, width: 130, height: 60, backgroundColor: "#a5d8ff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#4a9eed", label: { text: "Booking", fontSize: 18 } },
  { type: "rectangle", id: "cap4", x: 705, y: 170, width: 130, height: 60, backgroundColor: "#a5d8ff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#4a9eed", label: { text: "Submission", fontSize: 18 } },
  { type: "rectangle", id: "cap5", x: 875, y: 170, width: 130, height: 60, backgroundColor: "#a5d8ff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#4a9eed", label: { text: "Attribution", fontSize: 18 } },

  // === Line 4: AI Agents (purple) ===
  { type: "arrow", id: "ln4", x: 260, y: 285, width: 680, height: 0, points: [[0, 0], [680, 0]], strokeColor: "#8b5cf6", strokeWidth: 5, endArrowhead: null },
  { type: "rectangle", id: "aix1", x: 195, y: 255, width: 130, height: 60, backgroundColor: "#d0bfff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#8b5cf6", label: { text: "Persona", fontSize: 18 } },
  { type: "rectangle", id: "aix2", x: 365, y: 255, width: 130, height: 60, backgroundColor: "#d0bfff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#8b5cf6", label: { text: "Web Chat Bot", fontSize: 16 } },
  { type: "rectangle", id: "aix3", x: 535, y: 255, width: 130, height: 60, backgroundColor: "#d0bfff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#8b5cf6", label: { text: "SMS Bot", fontSize: 18 } },
  { type: "rectangle", id: "aix4", x: 705, y: 255, width: 130, height: 60, backgroundColor: "#d0bfff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#8b5cf6", label: { text: "Voice Bot", fontSize: 18 } },
  { type: "rectangle", id: "aix5", x: 875, y: 255, width: 130, height: 60, backgroundColor: "#d0bfff", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#8b5cf6", label: { text: "KB (KB scrape)", fontSize: 16 } },

  // === Line 1: CRM (red) — the central trunk ===
  { type: "arrow", id: "ln1", x: 135, y: 380, width: 930, height: 0, points: [[0, 0], [930, 0]], strokeColor: "#ef4444", strokeWidth: 6, endArrowhead: null },
  { type: "rectangle", id: "crm1", x: 70, y: 350, width: 130, height: 60, backgroundColor: "#ffc9c9", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ef4444", label: { text: "Notes", fontSize: 18 } },
  { type: "rectangle", id: "crm2", x: 225, y: 350, width: 130, height: 60, backgroundColor: "#ffc9c9", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ef4444", label: { text: "Activity", fontSize: 18 } },
  { type: "rectangle", id: "crm3", x: 380, y: 350, width: 130, height: 60, backgroundColor: "#ffc9c9", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ef4444", label: { text: "Task", fontSize: 18 } },
  { type: "rectangle", id: "crm4", x: 535, y: 350, width: 130, height: 60, backgroundColor: "#ffc9c9", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ef4444", label: { text: "Event", fontSize: 18 } },
  { type: "rectangle", id: "crm5", x: 690, y: 350, width: 130, height: 60, backgroundColor: "#fff3bf", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ef4444", strokeWidth: 4, label: { text: "Contact", fontSize: 20 } },
  { type: "rectangle", id: "crm6", x: 845, y: 350, width: 130, height: 60, backgroundColor: "#ffc9c9", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ef4444", strokeWidth: 3, label: { text: "Deal", fontSize: 18 } },
  { type: "rectangle", id: "crm7", x: 1000, y: 350, width: 130, height: 60, backgroundColor: "#ffc9c9", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ef4444", label: { text: "Pipeline", fontSize: 18 } },

  // === Line 5: Sales (amber) ===
  { type: "arrow", id: "ln5", x: 200, y: 475, width: 800, height: 0, points: [[0, 0], [800, 0]], strokeColor: "#f59e0b", strokeWidth: 5, endArrowhead: null },
  { type: "rectangle", id: "sal1", x: 135, y: 445, width: 130, height: 60, backgroundColor: "#ffd8a8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#f59e0b", label: { text: "Product", fontSize: 18 } },
  { type: "rectangle", id: "sal2", x: 295, y: 445, width: 130, height: 60, backgroundColor: "#ffd8a8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#f59e0b", label: { text: "Quote", fontSize: 18 } },
  { type: "rectangle", id: "sal3", x: 455, y: 445, width: 130, height: 60, backgroundColor: "#ffd8a8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#f59e0b", label: { text: "Public /q/", fontSize: 18 } },
  { type: "rectangle", id: "sal4", x: 615, y: 445, width: 130, height: 60, backgroundColor: "#ffd8a8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#f59e0b", label: { text: "Accept", fontSize: 18 } },
  { type: "rectangle", id: "sal5", x: 775, y: 445, width: 130, height: 60, backgroundColor: "#ffd8a8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#f59e0b", label: { text: "Invoice", fontSize: 18 } },
  { type: "rectangle", id: "sal6", x: 935, y: 445, width: 130, height: 60, backgroundColor: "#ffd8a8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#f59e0b", label: { text: "Paid", fontSize: 18 } },

  // === Line 3: Comms (green) ===
  { type: "arrow", id: "ln3", x: 260, y: 560, width: 680, height: 0, points: [[0, 0], [680, 0]], strokeColor: "#22c55e", strokeWidth: 5, endArrowhead: null },
  { type: "rectangle", id: "com1", x: 195, y: 530, width: 130, height: 60, backgroundColor: "#b2f2bb", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#22c55e", label: { text: "Email", fontSize: 18 } },
  { type: "rectangle", id: "com2", x: 365, y: 530, width: 130, height: 60, backgroundColor: "#b2f2bb", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#22c55e", label: { text: "SMS", fontSize: 18 } },
  { type: "rectangle", id: "com3", x: 535, y: 530, width: 130, height: 60, backgroundColor: "#b2f2bb", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#22c55e", label: { text: "Templates", fontSize: 18 } },
  { type: "rectangle", id: "com4", x: 705, y: 530, width: 130, height: 60, backgroundColor: "#b2f2bb", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#22c55e", label: { text: "Broadcasts", fontSize: 18 } },
  { type: "rectangle", id: "com5", x: 875, y: 530, width: 130, height: 60, backgroundColor: "#b2f2bb", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#22c55e", label: { text: "Opt-out", fontSize: 18 } },

  // === Line 6: Automation (pink) ===
  { type: "arrow", id: "ln6", x: 260, y: 645, width: 680, height: 0, points: [[0, 0], [680, 0]], strokeColor: "#ec4899", strokeWidth: 5, endArrowhead: null },
  { type: "rectangle", id: "aut1", x: 195, y: 615, width: 130, height: 60, backgroundColor: "#eebefa", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ec4899", label: { text: "Trigger", fontSize: 18 } },
  { type: "rectangle", id: "aut2", x: 365, y: 615, width: 130, height: 60, backgroundColor: "#eebefa", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ec4899", label: { text: "Recipe", fontSize: 18 } },
  { type: "rectangle", id: "aut3", x: 535, y: 615, width: 130, height: 60, backgroundColor: "#eebefa", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ec4899", label: { text: "QStash", fontSize: 18 } },
  { type: "rectangle", id: "aut4", x: 705, y: 615, width: 130, height: 60, backgroundColor: "#eebefa", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ec4899", label: { text: "Send", fontSize: 18 } },
  { type: "rectangle", id: "aut5", x: 875, y: 615, width: 130, height: 60, backgroundColor: "#eebefa", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#ec4899", label: { text: "History", fontSize: 18 } },

  // === Line 7: Public API (cyan) ===
  { type: "arrow", id: "ln7", x: 200, y: 730, width: 800, height: 0, points: [[0, 0], [800, 0]], strokeColor: "#06b6d4", strokeWidth: 5, endArrowhead: null },
  { type: "rectangle", id: "api1", x: 135, y: 700, width: 130, height: 60, backgroundColor: "#c3fae8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#06b6d4", label: { text: "Keys", fontSize: 18 } },
  { type: "rectangle", id: "api2", x: 295, y: 700, width: 130, height: 60, backgroundColor: "#c3fae8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#06b6d4", label: { text: "REST", fontSize: 18 } },
  { type: "rectangle", id: "api3", x: 455, y: 700, width: 130, height: 60, backgroundColor: "#c3fae8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#06b6d4", label: { text: "Webhooks", fontSize: 18 } },
  { type: "rectangle", id: "api4", x: 615, y: 700, width: 130, height: 60, backgroundColor: "#c3fae8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#06b6d4", label: { text: "Replay", fontSize: 18 } },
  { type: "rectangle", id: "api5", x: 775, y: 700, width: 130, height: 60, backgroundColor: "#c3fae8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#06b6d4", label: { text: "Recipes", fontSize: 18 } },
  { type: "rectangle", id: "api6", x: 935, y: 700, width: 130, height: 60, backgroundColor: "#c3fae8", fillStyle: "solid", roundness: { type: 3 }, strokeColor: "#06b6d4", label: { text: "Docs", fontSize: 18 } },

  // === Interchange annotations ===
  { type: "text", id: "contInt", x: 622, y: 417, text: "interchange", fontSize: 14, strokeColor: "#9a3412" },
  { type: "text", id: "subInt", x: 228, y: 152, text: "interchange", fontSize: 14, strokeColor: "#475569" },

  // === Interchange bridges (dashed) ===
  { type: "arrow", id: "br1", x: 770, y: 230, width: -15, height: 120, points: [[0, 0], [-15, 120]], strokeColor: "#ef4444", strokeStyle: "dashed", strokeWidth: 3, opacity: 60, endArrowhead: "arrow" },
  { type: "arrow", id: "br2", x: 600, y: 315, width: 155, height: 35, points: [[0, 0], [155, 35]], strokeColor: "#ef4444", strokeStyle: "dashed", strokeWidth: 3, opacity: 60, endArrowhead: "arrow" },
  { type: "arrow", id: "br3", x: 755, y: 410, width: -495, height: 120, points: [[0, 0], [-495, 120]], strokeColor: "#22c55e", strokeStyle: "dashed", strokeWidth: 3, opacity: 60, endArrowhead: "arrow" },
  { type: "arrow", id: "br4", x: 910, y: 410, width: -550, height: 35, points: [[0, 0], [-550, 35]], strokeColor: "#f59e0b", strokeStyle: "dashed", strokeWidth: 3, opacity: 60, endArrowhead: "arrow" },

  // === Legend ===
  { type: "text", id: "leg", x: 80, y: 810, text: "Lines:", fontSize: 18, strokeColor: "#1e1e1e" },
  { type: "ellipse", id: "legA", x: 155, y: 815, width: 16, height: 16, backgroundColor: "#cbd5e1", fillStyle: "solid", strokeColor: "#475569" },
  { type: "text", id: "legAt", x: 177, y: 813, text: "Platform", fontSize: 16, strokeColor: "#475569" },
  { type: "ellipse", id: "legB", x: 272, y: 815, width: 16, height: 16, backgroundColor: "#a5d8ff", fillStyle: "solid", strokeColor: "#4a9eed" },
  { type: "text", id: "legBt", x: 294, y: 813, text: "Capture", fontSize: 16, strokeColor: "#2563eb" },
  { type: "ellipse", id: "legC", x: 380, y: 815, width: 16, height: 16, backgroundColor: "#d0bfff", fillStyle: "solid", strokeColor: "#8b5cf6" },
  { type: "text", id: "legCt", x: 402, y: 813, text: "AI Agents", fontSize: 16, strokeColor: "#7c3aed" },
  { type: "ellipse", id: "legD", x: 510, y: 815, width: 16, height: 16, backgroundColor: "#ffc9c9", fillStyle: "solid", strokeColor: "#ef4444" },
  { type: "text", id: "legDt", x: 532, y: 813, text: "CRM", fontSize: 16, strokeColor: "#b91c1c" },
  { type: "ellipse", id: "legE", x: 600, y: 815, width: 16, height: 16, backgroundColor: "#ffd8a8", fillStyle: "solid", strokeColor: "#f59e0b" },
  { type: "text", id: "legEt", x: 622, y: 813, text: "Sales", fontSize: 16, strokeColor: "#9a5030" },
  { type: "ellipse", id: "legF", x: 698, y: 815, width: 16, height: 16, backgroundColor: "#b2f2bb", fillStyle: "solid", strokeColor: "#22c55e" },
  { type: "text", id: "legFt", x: 720, y: 813, text: "Comms", fontSize: 16, strokeColor: "#15803d" },
  { type: "ellipse", id: "legG", x: 810, y: 815, width: 16, height: 16, backgroundColor: "#eebefa", fillStyle: "solid", strokeColor: "#ec4899" },
  { type: "text", id: "legGt", x: 832, y: 813, text: "Automation", fontSize: 16, strokeColor: "#be185d" },
  { type: "ellipse", id: "legH", x: 962, y: 815, width: 16, height: 16, backgroundColor: "#c3fae8", fillStyle: "solid", strokeColor: "#06b6d4" },
  { type: "text", id: "legHt", x: 984, y: 813, text: "Public API", fontSize: 16, strokeColor: "#0e7490" },

  { type: "text", id: "foot", x: 250, y: 850, text: "Bold-bordered stations are interchanges where every line passes through.", fontSize: 14, strokeColor: "#757575" },
  { type: "text", id: "foot2", x: 40, y: 875, text: "Dashed lines show how leads flow between domains: Capture/AI -> Contact; Contact -> Comms; Deal -> Sales.", fontSize: 14, strokeColor: "#757575" },
];

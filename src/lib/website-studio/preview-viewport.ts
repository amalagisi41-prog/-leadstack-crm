/**
 * Preview canvas viewport math.
 *
 * The previous preview rendered the site at a fixed 1080px width and applied
 * `transform: scale()` to fit the panel. Two things were wrong with that:
 *
 *  1. `transform` is a *visual* operation — it does not affect layout. The
 *     scaled element still occupied its full unscaled height in the document,
 *     so the scroll container believed the content was (say) 4000px tall when
 *     only ~2000px were visible. That produced a large dead scroll region
 *     below the site and made scroll position meaningless.
 *
 *  2. A fixed 1080px width means there is no device viewport to preview. The
 *     renderer's intrinsic `auto-fit` grids respond to their container, so at
 *     a permanently-1080px container a mobile layout can never be seen.
 *
 * The fix is to give the preview a real width per device and compensate the
 * outer canvas box for the scale, so layout and scrolling stay truthful.
 * Pure functions here; the React canvas consumes them.
 */

export interface PreviewDevice {
  id: string;
  label: string;
  /** True CSS viewport width the document renders at. */
  width: number;
  /** Nominal device height — used for the empty/initial box only. */
  height: number;
}

export const PREVIEW_DEVICES: readonly PreviewDevice[] = [
  { id: "desktop", label: "Desktop", width: 1440, height: 900 },
  { id: "laptop", label: "Laptop", width: 1280, height: 800 },
  { id: "tablet", label: "Tablet", width: 768, height: 1024 },
  { id: "mobile", label: "Mobile", width: 390, height: 844 },
  { id: "mobile-sm", label: "Small mobile", width: 375, height: 812 },
] as const;

export const DEFAULT_PREVIEW_DEVICE_ID = "desktop";

/** "fit" scales to the available width; the numbers are explicit zoom levels. */
export type PreviewZoom = "fit" | 1 | 0.75 | 0.5;

export const PREVIEW_ZOOMS: readonly PreviewZoom[] = ["fit", 1, 0.75, 0.5];

export function getPreviewDevice(id: string): PreviewDevice {
  return (
    PREVIEW_DEVICES.find((d) => d.id === id) ??
    PREVIEW_DEVICES.find((d) => d.id === DEFAULT_PREVIEW_DEVICE_ID)!
  );
}

/**
 * Scale factor for the canvas. "fit" never scales *up* past 1 — blowing a
 * 390px mobile document up to fill a wide panel would misrepresent it.
 */
export function computePreviewScale({
  containerWidth,
  deviceWidth,
  zoom,
}: {
  containerWidth: number;
  deviceWidth: number;
  zoom: PreviewZoom;
}): number {
  if (zoom !== "fit") return zoom;
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1;
  if (!Number.isFinite(deviceWidth) || deviceWidth <= 0) return 1;
  return Math.min(1, containerWidth / deviceWidth);
}

/**
 * Outer box size for a scaled document. This is the compensation the old
 * implementation was missing: the wrapper must claim the *scaled* dimensions
 * so surrounding layout and scroll height match what is actually visible.
 */
export function computeCanvasBox({
  deviceWidth,
  contentHeight,
  scale,
}: {
  deviceWidth: number;
  contentHeight: number;
  scale: number;
}): { width: number; height: number } {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const safeHeight =
    Number.isFinite(contentHeight) && contentHeight > 0 ? contentHeight : 0;
  return {
    width: Math.round(deviceWidth * safeScale),
    height: Math.round(safeHeight * safeScale),
  };
}

/** Label shown under the canvas, e.g. "Mobile · 390 × 844 · 75%". */
export function describePreview(device: PreviewDevice, scale: number): string {
  return `${device.label} · ${device.width} × ${device.height} · ${Math.round(scale * 100)}%`;
}

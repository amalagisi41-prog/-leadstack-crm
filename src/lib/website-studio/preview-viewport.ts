export type WebsitePreviewDevice = "desktop" | "mobile";

export const WEBSITE_PREVIEW_WIDTHS: Record<WebsitePreviewDevice, number> = {
  desktop: 1280,
  mobile: 390,
};

export function calculatePreviewScale(
  availableWidth: number,
  device: WebsitePreviewDevice,
) {
  const viewportWidth = WEBSITE_PREVIEW_WIDTHS[device];
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1;
  return Math.min(1, availableWidth / viewportWidth);
}

export function calculateScaledPreviewHeight(
  contentHeight: number,
  scale: number,
) {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return 0;
  if (!Number.isFinite(scale) || scale <= 0) return contentHeight;
  return Math.ceil(contentHeight * scale);
}

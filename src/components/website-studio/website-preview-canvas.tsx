"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  computeCanvasBox,
  computePreviewScale,
  describePreview,
  getPreviewDevice,
  PREVIEW_DEVICES,
  PREVIEW_ZOOMS,
  type PreviewZoom,
} from "@/lib/website-studio/preview-viewport";

/**
 * Device-accurate preview canvas.
 *
 * The site is portalled into an iframe rather than rendered inline, so the
 * document gets a real CSS viewport at the selected device width. That
 * matters for two reasons: media queries inside a user's custom CSS resolve
 * against the device instead of the dashboard window, and the renderer's
 * intrinsic `auto-fit` grids collapse at the width they actually would on
 * that device.
 *
 * Scaling is applied to the iframe with the wrapper compensated for it (see
 * `computeCanvasBox`) so the surrounding layout and scrollbar reflect what is
 * visible, instead of reserving the unscaled height.
 */

/** Minimal reset so the iframe document starts flush at the top. */
const IFRAME_RESET = "html,body{margin:0;padding:0;}";

export function WebsitePreviewCanvas({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [deviceId, setDeviceId] = useState("desktop");
  const [zoom, setZoom] = useState<PreviewZoom>("fit");
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const device = getPreviewDevice(deviceId);
  const scale = computePreviewScale({
    containerWidth,
    deviceWidth: device.width,
    zoom,
  });
  const box = computeCanvasBox({
    deviceWidth: device.width,
    contentHeight: contentHeight || device.height,
    scale,
  });

  // Track the available width so "fit" stays correct as the panel resizes.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Attach to the iframe document once it exists, injecting the reset. Same
  // origin (no src), so this is a normal document we own.
  const attachToIframe = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    if (!doc.getElementById("agentstack-preview-reset")) {
      const style = doc.createElement("style");
      style.id = "agentstack-preview-reset";
      style.textContent = IFRAME_RESET;
      doc.head.appendChild(style);
    }
    setMountNode(doc.body);
  }, []);

  useEffect(() => {
    attachToIframe();
  }, [attachToIframe]);

  // Measure the real document height so the iframe never scrolls internally
  // and the outer container owns scrolling.
  useEffect(() => {
    if (!mountNode) return;
    const measure = () => {
      const doc = mountNode.ownerDocument;
      const next = Math.max(
        mountNode.scrollHeight,
        doc.documentElement?.scrollHeight ?? 0
      );
      if (next > 0) setContentHeight(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(mountNode);
    // Images and fonts settle after first paint; re-measure on load.
    const win = mountNode.ownerDocument.defaultView;
    win?.addEventListener("load", measure);
    return () => {
      ro.disconnect();
      win?.removeEventListener("load", measure);
    };
  }, [mountNode, deviceId]);

  return (
    <div className={className}>
      {/* Controls stay outside the preview viewport so they can never cover
          the site's own header, forms, or footer. */}
      <div className="bg-card flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          {PREVIEW_DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDeviceId(d.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                d.id === deviceId
                  ? "bg-[#1a2f50] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {PREVIEW_ZOOMS.map((z) => (
            <button
              key={String(z)}
              type="button"
              onClick={() => setZoom(z)}
              className={`rounded px-2 py-1 text-[11px] font-medium tabular-nums transition-colors ${
                z === zoom
                  ? "bg-[#1a2f50] text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {z === "fit" ? "Fit" : `${Math.round(z * 100)}%`}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={containerRef}
        className="bg-muted/40 flex justify-center overflow-auto p-4"
      >
        <div
          style={{ width: box.width, height: box.height }}
          className="shrink-0 overflow-hidden bg-white shadow-sm"
        >
          <iframe
            ref={iframeRef}
            onLoad={attachToIframe}
            title="Website preview"
            // No src: a same-origin blank document we render into directly.
            style={{
              width: device.width,
              height: contentHeight || device.height,
              border: "none",
              display: "block",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          />
          {mountNode ? createPortal(children, mountNode) : null}
        </div>
      </div>

      <p className="text-muted-foreground border-t px-3 py-1.5 text-center text-[11px] tabular-nums">
        {describePreview(device, scale)}
      </p>
    </div>
  );
}

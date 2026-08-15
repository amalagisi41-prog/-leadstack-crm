"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  calculatePreviewScale,
  calculateScaledPreviewHeight,
  WEBSITE_PREVIEW_WIDTHS,
  type WebsitePreviewDevice,
} from "@/lib/website-studio/preview-viewport";

export function WebsitePreviewCanvas({
  device,
  children,
}: {
  device: WebsitePreviewDevice;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState(0);
  const viewportWidth = WEBSITE_PREVIEW_WIDTHS[device];

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const document = documentRef.current;
    if (!frame || !document) return;

    const measure = () => {
      const nextScale = calculatePreviewScale(frame.clientWidth, device);
      setScale(nextScale);
      setScaledHeight(
        calculateScaledPreviewHeight(document.scrollHeight, nextScale),
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(document);
    return () => observer.disconnect();
  }, [device]);

  return (
    <div
      ref={frameRef}
      className="h-[calc(72vh-41px)] overflow-auto bg-slate-100 p-3 sm:p-5"
      data-preview-device={device}
    >
      <div
        className="relative mx-auto overflow-hidden bg-white shadow-xl ring-1 ring-slate-900/10"
        style={{
          width: viewportWidth * scale,
          height: scaledHeight,
          borderRadius: device === "mobile" ? 24 * scale : 8 * scale,
        }}
      >
        <div
          ref={documentRef}
          className="absolute top-0 left-0"
          style={{
            width: viewportWidth,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

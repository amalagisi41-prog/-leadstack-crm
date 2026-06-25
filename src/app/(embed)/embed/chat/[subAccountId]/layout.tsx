import type { ReactNode } from "react";

/**
 * Minimal layout for the /embed/chat/[subAccountId] iframe. No
 * navigation, no sidebar, no providers beyond what the root layout
 * already mounts. The iframe is full-bleed — width/height are controlled
 * by the parent widget loader via the iframe element's styles.
 */
export default function EmbedChatLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

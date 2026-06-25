"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuItem {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

/**
 * Small "..." actions menu for the member surface (light-themed on purpose —
 * the shadcn dropdown follows the app theme and would dark-bleed on /c/*).
 * Closes on outside click via a full-screen transparent backdrop.
 */
export function ActionsMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-1 text-[#909090] hover:bg-[#F0F0F0] hover:text-[#202124]"
        title="More"
        aria-label="More actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-10 cursor-default"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 min-w-[140px] overflow-hidden rounded-lg border border-[#E4E4E4] bg-white py-1 shadow-lg">
            {items.map((it, i) => (
              <button
                key={i}
                onClick={() => {
                  it.onClick();
                  setOpen(false);
                }}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-sm hover:bg-[#F8F7F5]",
                  it.destructive ? "text-red-600" : "text-[#202124]",
                )}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

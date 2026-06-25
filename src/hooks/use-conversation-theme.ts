"use client";

import { useEffect, useState } from "react";

export type ConversationTheme = "standard" | "native";

const STORAGE_KEY = "ls:conversation-theme";

/**
 * Operator preference for the conversation thread skin:
 *  - "standard" — neutral brand bubbles (default).
 *  - "native"   — each channel restyles to look like its real app
 *                 (WhatsApp green + delivery ticks, SMS iMessage-blue).
 *
 * Persisted per operator in localStorage. SSR-safe: defaults to "standard"
 * on first render, then hydrates from storage on mount.
 */
export function useConversationTheme(): {
  theme: ConversationTheme;
  setTheme: (t: ConversationTheme) => void;
} {
  const [theme, setThemeState] = useState<ConversationTheme>("standard");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "native" || v === "standard") setThemeState(v);
    } catch {
      // ignore — private mode / storage disabled
    }
  }, []);

  const setTheme = (t: ConversationTheme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // ignore
    }
  };

  return { theme, setTheme };
}

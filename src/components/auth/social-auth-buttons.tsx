"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  signInWithApple,
  signInWithGoogle,
  type SocialAuthResult,
} from "@/lib/firebase/auth";

export function SocialAuthButtons({
  mode,
  onError,
  tone = "light",
}: {
  mode: "login" | "signup";
  onError: (message: string) => void;
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<"google" | "apple" | null>(null);
  const action = mode === "signup" ? "Sign up" : "Log in";
  const heading = mode === "signup" ? "Sign up with" : "Log in with";

  async function authenticate(kind: "google" | "apple") {
    setProvider(kind);
    onError("");
    try {
      const result: SocialAuthResult =
        kind === "google"
          ? await signInWithGoogle()
          : await signInWithApple();
      if (/^https?:\/\//.test(result.redirectTo)) {
        window.location.assign(result.redirectTo);
        return;
      }
      router.push(result.redirectTo);
      router.refresh();
    } catch (error) {
      const raw =
        error instanceof Error ? error.message : "Social sign-in failed.";
      const message = raw.includes("auth/operation-not-allowed")
        ? `${kind === "google" ? "Google" : "Apple"} sign-in must be enabled in Firebase Authentication.`
        : raw.includes("auth/popup-closed-by-user")
          ? "The sign-in window was closed before completion."
          : raw;
      onError(message);
    } finally {
      setProvider(null);
    }
  }

  return (
    <div className="space-y-3">
      <p
        className={
          tone === "dark"
            ? "text-xs font-medium uppercase tracking-[0.18em] text-blue-200/70"
            : "text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
        }
      >
        {heading}
      </p>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className={
          tone === "dark"
            ? "w-full justify-start border-white/20 bg-white px-4 text-[#12203a] hover:bg-white/90"
            : "w-full justify-start px-4"
        }
        disabled={provider !== null}
        onClick={() => authenticate("google")}
      >
        <GoogleIcon />
        {provider === "google" ? "Connecting…" : `${action} with Google`}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className={
          tone === "dark"
            ? "w-full justify-start border-white/20 bg-white px-4 text-[#12203a] hover:bg-white/90"
            : "w-full justify-start px-4"
        }
        disabled={provider !== null}
        onClick={() => authenticate("apple")}
      >
        <AppleIcon />
        {provider === "apple" ? "Connecting…" : `${action} with Apple`}
      </Button>
      <div className="flex items-center gap-3 py-1">
        <span className={tone === "dark" ? "h-px flex-1 bg-white/20" : "h-px flex-1 bg-border"} />
        <span className={tone === "dark" ? "text-xs uppercase tracking-wider text-blue-200/60" : "text-xs uppercase tracking-wider text-muted-foreground"}>or continue with email</span>
        <span className={tone === "dark" ? "h-px flex-1 bg-white/20" : "h-px flex-1 bg-border"} />
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.3Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4L15.4 17c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.4-4H3.3v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.6 14a6 6 0 0 1 0-3.9V7.5H3.3a10 10 0 0 0 0 9.1L6.6 14Z" />
      <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.3 7.5l3.3 2.6A5.8 5.8 0 0 1 12 6Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4 fill-current" aria-hidden="true">
      <path d="M17.1 12.6c0-2.7 2.2-4 2.3-4.1a5 5 0 0 0-3.9-2.1c-1.7-.2-3.2 1-4.1 1s-2.2-1-3.6-1A5.3 5.3 0 0 0 3.3 9c-1.9 3.3-.5 8.2 1.4 10.9.9 1.3 2 2.8 3.5 2.7 1.4-.1 1.9-.9 3.6-.9s2.2.9 3.6.9c1.5 0 2.5-1.3 3.4-2.7a12 12 0 0 0 1.6-3.3 4.7 4.7 0 0 1-3.3-4ZM14.4 4.7A4.8 4.8 0 0 0 15.5 1a5 5 0 0 0-3.4 1.7A4.5 4.5 0 0 0 11 6.2a4.2 4.2 0 0 0 3.4-1.5Z" />
    </svg>
  );
}

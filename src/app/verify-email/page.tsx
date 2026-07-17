"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  sendVerificationEmail,
  refreshSessionCookie,
  signOutUser,
} from "@/lib/firebase/auth";
import { LogoMark } from "@/components/brand/logo-mark";
import { CUSTOM_BRAND } from "@/config/landing";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const RESEND_COOLDOWN_MS = 30_000;

/**
 * Landing spot for a brand-new account whose email isn't verified yet —
 * middleware.ts redirects here whenever the session's custom claims carry
 * `requiresEmailVerification: true` and the token's `email_verified` is
 * still false. Existing accounts (never stamped with that claim) never
 * land here, so this can't lock anyone out retroactively.
 */
export default function VerifyEmailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // The client SDK's live user object can already show verified=true
    // (e.g. the link was clicked in another tab and this tab regained
    // focus) even though the redirect here was decided from a stale
    // session cookie. Catch up immediately instead of stranding them.
    if (user.emailVerified) {
      void refreshSessionCookie(user).then(() => {
        window.location.href = "/dashboard";
      });
    }
  }, [loading, user, router]);

  async function handleResend() {
    if (!user) return;
    setError("");
    setSending(true);
    try {
      await sendVerificationEmail(user);
      setSentAt(Date.now());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't send that email. Try again shortly.",
      );
    } finally {
      setSending(false);
    }
  }

  async function handleCheck() {
    if (!user) return;
    setError("");
    setChecking(true);
    try {
      await user.reload();
      if (!user.emailVerified) {
        setError(
          "Still not verified — click the link in the email first, then try again.",
        );
        return;
      }
      await refreshSessionCookie(user);
      window.location.href = "/dashboard";
    } catch {
      setError("Couldn't check your status. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  const onCooldown = sentAt != null && Date.now() - sentAt < RESEND_COOLDOWN_MS;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 font-sans">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={24} idSuffix="-verify" />
            <h1 className="font-sans text-2xl font-bold">{CUSTOM_BRAND.name}</h1>
          </Link>
        </div>

        <Card>
          <CardHeader className="items-center text-center">
            <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <MailCheck className="h-6 w-6" />
            </span>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a verification link to{" "}
              <span className="font-medium">{user?.email ?? "your email address"}</span>.
              Click it, then come back here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              className="w-full"
              onClick={handleCheck}
              disabled={checking}
            >
              {checking ? "Checking…" : "I've verified my email"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResend}
              disabled={sending || onCooldown}
            >
              {sending
                ? "Sending…"
                : onCooldown
                  ? "Email sent — check your inbox"
                  : "Resend verification email"}
            </Button>
          </CardContent>
          <CardFooter className="justify-center">
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={() => {
                void signOutUser().then(() => router.push("/login"));
              }}
            >
              Sign out and use a different account
            </button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

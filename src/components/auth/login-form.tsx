"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { sendPasswordReset, signInWithEmail } from "@/lib/firebase/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Mode = "signin" | "reset";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Pre-fill from `?email=` so the "you already have an account" link on
  // the signup page can carry the email over.
  const initialEmail = searchParams?.get("email") ?? "";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get("redirect") ?? "/dashboard";
      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendPasswordReset(email);
      // Always show "sent" — Firebase intentionally hides whether the
      // address exists. Don't leak account existence to the form.
      setResetSent(true);
    } catch (err) {
      // Firebase still throws on malformed addresses, network errors, etc.
      // For genuine user errors (invalid email shape) we show the message;
      // for "user not found" we'd still want to mask, but the wrapper
      // helper currently surfaces whatever Firebase returns.
      setError(err instanceof Error ? err.message : "Could not send reset.");
    } finally {
      setLoading(false);
    }
  }

  function switchToReset() {
    setMode("reset");
    setError("");
    setResetSent(false);
  }

  function switchToSignIn() {
    setMode("signin");
    setError("");
    setResetSent(false);
  }

  if (mode === "reset") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            We&apos;ll email you a link to set a new password.
          </CardDescription>
        </CardHeader>
        {resetSent ? (
          <>
            <CardContent>
              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <p className="font-medium">Check your inbox.</p>
                <p className="mt-1 text-muted-foreground">
                  If an account exists for{" "}
                  <span className="text-foreground">{email}</span>, a reset
                  link is on its way. The link expires in 1 hour.
                </p>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={switchToSignIn}
              >
                Back to sign in
              </Button>
            </CardFooter>
          </>
        ) : (
          <form onSubmit={handleReset}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
              <button
                type="button"
                onClick={switchToSignIn}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </button>
            </CardFooter>
          </form>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log In</CardTitle>
        <CardDescription>
          Enter your email and password to access your account.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSignIn}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                onClick={switchToReset}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Forgot password?
              </button>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

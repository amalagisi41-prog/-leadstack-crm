"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmail } from "@/lib/firebase/auth";
import { sendWelcomeEmail } from "@/lib/firestore/mail";
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

type Status =
  | { kind: "checking" }
  | { kind: "not_ready" }
  | { kind: "invalid" }
  | { kind: "already_claimed" }
  | { kind: "ready"; email: string };

const RETRY_DELAY_MS = 2500;
const MAX_RETRIES = 8;

/**
 * The other half of the claim-token flow started by
 * `/api/checkout/subscribe` and completed by `/api/auth/claim-subscription`.
 * A buyer lands here straight from Stripe with `?session_id=...&t=...` in
 * the URL. Polls the GET status endpoint (webhook delivery can lag a beat
 * behind the Stripe redirect — same race the founders/GitHub-invite flow
 * documents handling with a 425 + auto-retry) before showing the "create
 * your password" form.
 */
export function WelcomeClaimForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get("session_id") ?? "";
  const token = searchParams?.get("t") ?? "";

  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionId || !token) {
      setStatus({ kind: "invalid" });
      return;
    }
    let cancelled = false;
    let attempts = 0;

    async function check() {
      attempts += 1;
      try {
        const res = await fetch(
          `/api/auth/claim-subscription?session_id=${encodeURIComponent(sessionId)}&t=${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        if (res.status === 425) {
          if (attempts < MAX_RETRIES) {
            setTimeout(check, RETRY_DELAY_MS);
          } else {
            setStatus({ kind: "not_ready" });
          }
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          ready?: boolean;
          claimed?: boolean;
          email?: string;
        };
        if (!res.ok) {
          setStatus({ kind: "invalid" });
          return;
        }
        if (data.claimed) {
          setStatus({ kind: "already_claimed" });
          return;
        }
        setStatus({ kind: "ready", email: data.email ?? "" });
      } catch {
        if (!cancelled) setStatus({ kind: "invalid" });
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [sessionId, token]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/claim-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, token, password, displayName }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        email?: string;
        redirectTo?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error ?? "Could not finish setting up your workspace.");
      }

      const email = payload.email ?? (status.kind === "ready" ? status.email : "");
      await signInWithEmail(email, password);
      void sendWelcomeEmail(email, displayName || email.split("@")[0]).catch((err) =>
        console.warn("sendWelcomeEmail failed", err),
      );

      router.push(payload.redirectTo ?? "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  if (status.kind === "checking") {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Confirming your payment…
        </CardContent>
      </Card>
    );
  }

  if (status.kind === "not_ready") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Still confirming your payment</CardTitle>
          <CardDescription>
            This is taking longer than usual. Refresh this page in a minute —
            if it still doesn&apos;t work, contact support with your payment
            confirmation.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status.kind === "invalid") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This link isn&apos;t valid</CardTitle>
          <CardDescription>
            The claim link is missing, malformed, or has expired. If you just
            paid, check your email for the confirmation link, or contact
            support.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (status.kind === "already_claimed") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This workspace was already set up</CardTitle>
          <CardDescription>
            Looks like you already created your login.{" "}
            <a href="/login" className="text-primary underline">
              Sign in instead
            </a>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome — let&apos;s set up your login</CardTitle>
        <CardDescription>
          Payment confirmed for <span className="font-medium">{status.email}</span>.
          Pick a password to finish creating your workspace.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="w-name">Your name</Label>
            <Input
              id="w-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="w-password">Password</Label>
            <Input
              id="w-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Setting up your workspace…" : "Create my workspace"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

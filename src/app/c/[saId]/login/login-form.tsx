"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MemberLoginForm({
  saId,
  join,
}: {
  saId: string;
  join?: string;
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter your email");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/community/${saId}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), join }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-[#202124]">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1 text-[#909090]">
          If that email is valid, we&apos;ve sent a one-tap sign-in link to{" "}
          <span className="font-medium text-[#202124]">{email.trim()}</span>. The
          link expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-[#202124]">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          className="border-[#E4E4E4] bg-white text-[#202124] placeholder:text-[#909090]"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button
        type="submit"
        className="w-full bg-[#202124] text-white hover:bg-[#202124]/90"
        disabled={submitting}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending link…
          </>
        ) : (
          "Send sign-in link"
        )}
      </Button>
    </form>
  );
}

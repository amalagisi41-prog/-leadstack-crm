"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Save } from "lucide-react";
import { toast } from "sonner";
import { changePassword } from "@/lib/firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MIN_LENGTH = 6;

/**
 * Change-password card. Mounts in the user's profile settings.
 *
 * Firebase requires a recent reauth before updating sensitive fields,
 * so we collect the current password and reauthenticate before calling
 * updatePassword. Errors are mapped to user-friendly messages — Firebase's
 * raw codes (`auth/wrong-password`, etc.) are unhelpful to end users.
 */
export function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (next.length < MIN_LENGTH) {
      toast.error(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords don't match.");
      return;
    }
    if (next === current) {
      toast.error("New password must differ from current.");
      return;
    }

    setSaving(true);
    try {
      await changePassword(current, next);
      toast.success("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      // Firebase error codes look like "Firebase: Error (auth/wrong-password)."
      // Surface the most common ones as something readable.
      if (code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) {
        toast.error("Current password is incorrect.");
      } else if (code.includes("auth/weak-password")) {
        toast.error("New password is too weak — try a longer one.");
      } else if (code.includes("auth/too-many-requests")) {
        toast.error("Too many attempts. Try again in a few minutes.");
      } else if (code.includes("auth/requires-recent-login")) {
        toast.error("Session too old. Sign out and back in, then try again.");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not change password.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
          <KeyRound className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Password</h2>
          <p className="text-xs text-muted-foreground">
            Change your sign-in password. You&apos;ll need your current one.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={MIN_LENGTH}
          />
          <p className="text-[11px] text-muted-foreground">
            At least {MIN_LENGTH} characters.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save className="mr-1 h-3.5 w-3.5" />
            {saving ? "Updating…" : "Update password"}
          </Button>
        </div>
      </form>
    </section>
  );
}

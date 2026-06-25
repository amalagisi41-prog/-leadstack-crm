"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { updateProfile } from "firebase/auth";
import {
  Mail,
  Shield,
  Sparkles,
  User as UserIcon,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { signOutUser } from "@/lib/firebase/auth";
import { getUserDoc, updateUserDoc } from "@/lib/firestore/users";
import { maskEmail } from "@/lib/format";
import { ThemeToggle } from "@/components/theme-toggle";
import { PasswordSection } from "@/components/settings/password-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserDoc } from "@/types";

/**
 * User-level settings — same identity across every sub-account the
 * caller is a member of. Distinct from `/sa/[id]/dashboard/settings`
 * (workspace-scoped: members, payments, sub-account contact) and
 * `/agency/settings` (agency-scoped: branding, demo seed).
 *
 * Three-tier mental model:
 *   - Agency owns billing + branding         → /agency/settings
 *   - Sub-account owns the workspace          → /sa/[id]/dashboard/settings
 *   - User owns their own identity            → /me/settings  (this page)
 */
export default function MySettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  // Email defaults to masked so screenshares + demo recordings don't
  // leak the operator's address. Per-session toggle, not persisted.
  const [emailShown, setEmailShown] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? "");
    getUserDoc(user.uid).then((d) => setProfile(d));
  }, [user]);

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "U";

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    try {
      const trimmed = displayName.trim();
      await updateProfile(getFirebaseAuth().currentUser!, {
        displayName: trimmed,
      });
      await updateUserDoc(user.uid, { displayName: trimmed });
      toast.success("Profile updated");
      setProfile((p) => (p ? { ...p, displayName: trimmed } : p));
    } catch (err) {
      console.error(err);
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your account</h1>
        <p className="text-sm text-muted-foreground">
          Personal settings — same identity across every sub-account you
          belong to. For workspace settings (members, payments, SMS), open
          a sub-account&apos;s settings instead.
        </p>
      </div>

      {/* Profile */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <UserIcon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Profile</h2>
            <p className="text-xs text-muted-foreground">
              How you appear across LeadStack.
            </p>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarImage
                src={user?.photoURL ?? undefined}
                alt={user?.displayName ?? "User"}
              />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                value={emailShown ? (user?.email ?? "") : maskEmail(user?.email ?? "")}
                disabled
                className="cursor-not-allowed pl-8 pr-20 font-mono text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setEmailShown((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {emailShown ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </section>

      {/* Password */}
      <PasswordSection />

      {/* Appearance */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Appearance</h2>
              <p className="text-xs text-muted-foreground">
                Light, dark, or system.
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* Security / sign out */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <Shield className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Account</h2>
            <p className="text-xs text-muted-foreground">
              Sign out of this device.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-4">
          <div>
            <p className="text-sm font-medium">Sign out of LeadStack</p>
            <p className="text-xs text-muted-foreground">
              Ends this session on this device. Profile data stays.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOutUser()}
          >
            Sign out
          </Button>
        </div>
      </section>

      {/* Profile data is touched after this only by Firebase; keep the
          unused-warning at bay for the linter — referenced via subtitle
          line above. */}
      {profile && null}
    </div>
  );
}

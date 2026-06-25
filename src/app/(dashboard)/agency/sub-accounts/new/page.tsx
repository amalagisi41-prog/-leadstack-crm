"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Building2, Hash, Mail, Phone, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimezoneSelect } from "@/components/ui/timezone-select";

export default function NewSubAccountPage() {
  const router = useRouter();
  const { agencyRole, loading } = useAuth();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState(
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC",
  );
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [nextNumber, setNextNumber] = useState<number | null>(null);

  useEffect(() => {
    if (loading || agencyRole !== "owner") return;
    let cancelled = false;
    fetch("/api/agency/sub-accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (typeof data.next === "number") setNextNumber(data.next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [loading, agencyRole]);

  if (!loading && agencyRole !== "owner") {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Only the agency owner can create sub-accounts.
        </p>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/agency" />}
          className="mt-4"
        >
          Back to agency
        </Button>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Sub-account name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const trimmedContactName = contactName.trim();
      const trimmedContactEmail = contactEmail.trim();
      const trimmedContactPhone = contactPhone.trim();
      const accountContact =
        !trimmedContactName && !trimmedContactEmail && !trimmedContactPhone
          ? null
          : {
              name: trimmedContactName,
              email: trimmedContactEmail,
              phone: trimmedContactPhone,
            };
      const res = await fetch("/api/agency/sub-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          timezone,
          accountContact,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        subAccountId?: string;
        accountNumber?: number;
      };
      if (!res.ok || !payload.subAccountId) {
        throw new Error(payload.error ?? "Could not create sub-account.");
      }
      toast.success(
        payload.accountNumber !== undefined
          ? `Created "${name.trim()}" (#${payload.accountNumber}).`
          : `Created "${name.trim()}".`,
      );
      router.push(`/sa/${payload.subAccountId}/dashboard`);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create sub-account.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/agency/sub-accounts"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sub-accounts
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          New sub-account
        </h1>
        <p className="text-sm text-muted-foreground">
          Stand up an isolated workspace for a client.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border bg-card p-5"
      >
        <div className="space-y-1.5">
          <Label htmlFor="account-number">Account number</Label>
          <div className="relative">
            <Hash className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="account-number"
              value={nextNumber !== null ? `#${nextNumber}` : "Loading…"}
              readOnly
              disabled
              className="cursor-not-allowed pl-8 font-mono text-muted-foreground"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Auto-assigned. The next sub-account in your agency receives this
            number; subsequent ones increment by one.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Acme Inc"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <p className="text-[11px] text-muted-foreground">
            Shown to your team in the sub-account switcher.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug (optional)</Label>
          <Input
            id="slug"
            placeholder="acme-inc"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Lowercase letters, numbers, and dashes. Used in some links.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="timezone">Timezone</Label>
          <TimezoneSelect
            id="timezone"
            value={timezone}
            onChange={setTimezone}
          />
          <p className="text-[11px] text-muted-foreground">
            Defaults to your browser&apos;s timezone. Used for send-window
            and reporting in this sub-account.
          </p>
        </div>

        <div className="space-y-4 border-t pt-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Account contact (optional)
            </h2>
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">
            Primary point of contact at the client. Skip for internal or
            personal sub-accounts — you can also add or edit this later from
            sub-account settings.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="contact-name">Name</Label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="contact-name"
                placeholder="Jane Doe"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="contact-email"
                type="email"
                placeholder="jane@acme.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Phone</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="contact-phone"
                placeholder="+15551234567"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            render={<Link href="/agency/sub-accounts" />}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create sub-account"}
          </Button>
        </div>
      </form>
    </div>
  );
}

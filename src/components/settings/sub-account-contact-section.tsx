"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Building2, Mail, Phone, User as UserIcon, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BusinessProfileContent } from "@/types/business-profile";

export function SubAccountContactSection() {
  const { subAccount, subAccountId, isAdmin } = useSubAccount();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [copyingFromBlueprint, setCopyingFromBlueprint] = useState(false);

  useEffect(() => {
    setName(subAccount?.accountContact?.name ?? "");
    setEmail(subAccount?.accountContact?.email ?? "");
    setPhone(subAccount?.accountContact?.phone ?? "");
  }, [subAccount]);

  if (!isAdmin) return null;

  // One-time copy, not a live sync — the Blueprint's agent identity and
  // this "who to reach at this client" contact are legitimately different
  // things for a multi-agent brokerage sub-account, but for the common
  // single-operator case they're the same person typed twice. This just
  // saves the retype; it never overwrites without the operator clicking.
  async function copyFromBlueprint() {
    setCopyingFromBlueprint(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/business-profile`);
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json()) as { profile?: Partial<BusinessProfileContent> };
      const profile = data.profile ?? {};
      const blueprintName = profile.agentName?.trim() ?? "";
      const blueprintEmail = profile.email?.trim() ?? "";
      const blueprintPhone = profile.phone?.trim() ?? "";
      if (!blueprintName && !blueprintEmail && !blueprintPhone) {
        toast.info("Your Business Blueprint doesn't have contact info yet.");
        return;
      }
      setName(blueprintName);
      setEmail(blueprintEmail);
      setPhone(blueprintPhone);
      toast.success("Copied from your Business Blueprint — review and save.");
    } catch {
      toast.error("Couldn't load your Business Blueprint.");
    } finally {
      setCopyingFromBlueprint(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      const trimmedPhone = phone.trim();
      const payload =
        !trimmedName && !trimmedEmail && !trimmedPhone
          ? null
          : { name: trimmedName, email: trimmedEmail, phone: trimmedPhone };
      const res = await fetch(`/api/agency/sub-accounts/${subAccountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountContact: payload }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
      toast.success(payload ? "Account contact saved." : "Account contact cleared.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Building2 className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Account contact</h2>
            <p className="text-xs text-muted-foreground">
              Primary point of contact at the client. Shown on the dashboard.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-xs"
          onClick={copyFromBlueprint}
          disabled={copyingFromBlueprint}
        >
          <Wand2 className="mr-1 h-3.5 w-3.5" />
          {copyingFromBlueprint ? "Copying…" : "Copy from Blueprint"}
        </Button>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Name</Label>
          <div className="relative">
            <UserIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@acme.com"
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
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
              className="pl-8"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            E.164 format recommended. Leave any field blank to omit it.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}

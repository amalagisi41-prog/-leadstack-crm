"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Mail, Radio } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { A2pCarrierStatus, A2pRegistration } from "@/types";

const STATUS_LABEL: Record<A2pCarrierStatus, string> = {
  not_started: "Not started",
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In review",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_TONE: Record<A2pCarrierStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  draft: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  submitted: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  in_review: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const NATIVE_SELECT_CLASSES =
  "flex h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&_option]:bg-background [&_option]:text-foreground";

function buildDefaultRegistration(
  subAccountName: string | null | undefined,
): A2pRegistration {
  return {
    status: "not_started",
    businessLegalName: subAccountName ?? "",
    businessType: "",
    supportEmail: "",
    supportPhone: "",
    websiteUrl: "",
    useCaseSummary: "",
    sampleMessages: ["", "", ""],
    emailUpdates: true,
    updateEmail: null,
    lastStatusNote: null,
    lastStatusChangedAt: null,
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
  };
}

function ensureSamples(values: string[] | null | undefined): [string, string, string] {
  return [values?.[0] ?? "", values?.[1] ?? "", values?.[2] ?? ""];
}

export function SubAccountA2pSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const snapshot = subAccount?.a2pRegistration ?? null;

  const [businessLegalName, setBusinessLegalName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [useCaseSummary, setUseCaseSummary] = useState("");
  const [sampleMessages, setSampleMessages] = useState<[string, string, string]>([
    "",
    "",
    "",
  ]);
  const [emailUpdates, setEmailUpdates] = useState(true);
  const [updateEmail, setUpdateEmail] = useState("");
  const [status, setStatus] = useState<A2pCarrierStatus>("not_started");
  const [lastStatusNote, setLastStatusNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = snapshot ?? buildDefaultRegistration(subAccount?.name);
    setBusinessLegalName(next.businessLegalName);
    setBusinessType(next.businessType);
    setSupportEmail(next.supportEmail);
    setSupportPhone(next.supportPhone);
    setWebsiteUrl(next.websiteUrl);
    setUseCaseSummary(next.useCaseSummary);
    setSampleMessages(ensureSamples(next.sampleMessages));
    setEmailUpdates(next.emailUpdates);
    setUpdateEmail(next.updateEmail ?? "");
    setStatus(next.status);
    setLastStatusNote(next.lastStatusNote ?? "");
  }, [snapshot, subAccount?.name, subAccountId]);

  const statusLabel = STATUS_LABEL[status];
  const stepOneDone = useMemo(
    () =>
      !!businessLegalName.trim() &&
      !!businessType.trim() &&
      !!supportEmail.trim() &&
      !!supportPhone.trim() &&
      !!websiteUrl.trim(),
    [businessLegalName, businessType, supportEmail, supportPhone, websiteUrl],
  );
  const stepTwoDone = useMemo(
    () =>
      !!useCaseSummary.trim() &&
      sampleMessages.filter((message) => message.trim().length > 0).length >= 2,
    [sampleMessages, useCaseSummary],
  );
  const stepThreeDone = status === "submitted" || status === "in_review" || status === "approved";

  if (!isAdmin) return null;

  async function save(nextStatus?: A2pCarrierStatus) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/a2p-registration`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessLegalName,
            businessType,
            supportEmail,
            supportPhone,
            websiteUrl,
            useCaseSummary,
            sampleMessages,
            emailUpdates,
            updateEmail,
            status: nextStatus ?? status,
            lastStatusNote,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save A2P setup.");
      }
      if (nextStatus) setStatus(nextStatus);
      toast.success(
        nextStatus && nextStatus !== status
          ? `A2P status updated to ${STATUS_LABEL[nextStatus]}.`
          : "A2P setup saved.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Radio className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">A2P registration</h2>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_TONE[status]}`}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Set up your texting number for carrier review in three steps:
            business details, messaging use-case, then submission tracking with
            optional email updates.
          </p>
          {snapshot?.lastStatusChangedAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              Last carrier-status update{" "}
              {formatRelativeTime(snapshot.lastStatusChangedAt)}.
            </p>
          )}
        </div>
      </header>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {[
          {
            number: 1,
            title: "Business details",
            body: "Tell carriers who is texting, how customers can reach you, and which site the number supports.",
            done: stepOneDone,
          },
          {
            number: 2,
            title: "Use-case + sample copy",
            body: "Show what kind of messages you send and include real examples for registration review.",
            done: stepTwoDone,
          },
          {
            number: 3,
            title: "Track review status",
            body: "Keep submission status current and optionally email the operator when status changes.",
            done: stepThreeDone,
          },
        ].map((step) => (
          <div key={step.number} className="rounded-xl border bg-background p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#173B7A] text-sm font-semibold text-white">
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : step.number}
              </span>
              <p className="text-sm font-medium">{step.title}</p>
            </div>
            <p className="text-xs text-muted-foreground">{step.body}</p>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="a2p-legal-name">Business legal name</Label>
            <Input
              id="a2p-legal-name"
              value={businessLegalName}
              onChange={(e) => setBusinessLegalName(e.target.value)}
              placeholder="AgentStack Realty LLC"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a2p-business-type">Business type</Label>
            <select
              id="a2p-business-type"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className={NATIVE_SELECT_CLASSES}
            >
              <option value="">Choose one…</option>
              <option value="sole_proprietor">Sole proprietor</option>
              <option value="llc">LLC</option>
              <option value="corporation">Corporation</option>
              <option value="partnership">Partnership</option>
              <option value="brokerage">Brokerage</option>
              <option value="team">Team</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a2p-support-email">Support email</Label>
            <Input
              id="a2p-support-email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="hello@yourbrokerage.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a2p-support-phone">Support phone</Label>
            <Input
              id="a2p-support-phone"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              placeholder="+1 203 555 0199"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="a2p-website">Website URL</Label>
            <Input
              id="a2p-website"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourbrand.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="a2p-use-case">Messaging use-case summary</Label>
          <Textarea
            id="a2p-use-case"
            value={useCaseSummary}
            onChange={(e) => setUseCaseSummary(e.target.value)}
            rows={3}
            placeholder="We text new buyer and seller inquiries, confirm showings, send listing docs, and follow up on requested callbacks."
          />
          <p className="text-[11px] text-muted-foreground">
            Keep this plain and specific. Think: what the customer opted in for,
            what messages they receive, and why those messages matter.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {sampleMessages.map((message, index) => (
            <div key={index} className="space-y-1.5">
              <Label htmlFor={`a2p-sample-${index}`}>Sample message {index + 1}</Label>
              <Textarea
                id={`a2p-sample-${index}`}
                value={message}
                onChange={(e) =>
                  setSampleMessages((prev) => {
                    const next = [...prev] as [string, string, string];
                    next[index] = e.target.value;
                    return next;
                  })
                }
                rows={4}
                placeholder={
                  index === 0
                    ? "Hi Sarah — thanks for requesting a showing at 47 Elmwood Ave. Are you free Saturday at 1pm or 3pm?"
                    : index === 1
                      ? "Just checking in on the Maplewood listing packet I sent over. Want me to resend the docs?"
                      : "Your consultation is booked for tomorrow at 10am. Reply STOP to opt out of text reminders."
                }
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="a2p-status">Carrier status</Label>
            <select
              id="a2p-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as A2pCarrierStatus)}
              className={NATIVE_SELECT_CLASSES}
            >
              {(
                [
                  "not_started",
                  "draft",
                  "submitted",
                  "in_review",
                  "approved",
                  "rejected",
                ] as const
              ).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="a2p-update-email">Status update email</Label>
            <Input
              id="a2p-update-email"
              type="email"
              value={updateEmail}
              onChange={(e) => setUpdateEmail(e.target.value)}
              placeholder={supportEmail || "ops@yourbrokerage.com"}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="a2p-status-note">Status note</Label>
            <Textarea
              id="a2p-status-note"
              value={lastStatusNote}
              onChange={(e) => setLastStatusNote(e.target.value)}
              rows={2}
              placeholder="Optional: what changed, what the carrier asked for, or who should follow up next."
            />
          </div>
        </div>

        <div className="rounded-xl border bg-background p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="a2p-email-updates"
              checked={emailUpdates}
              onCheckedChange={(checked) => setEmailUpdates(checked === true)}
            />
            <div className="min-w-0 flex-1">
              <Label htmlFor="a2p-email-updates" className="text-sm font-medium">
                Email me when the carrier status changes
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                AgentStack can send a quick update when this setup moves from
                draft to submitted, in review, approved, or rejected.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                If enabled, updates go to {updateEmail || supportEmail || "the email above"}.
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => save("draft")}
            disabled={saving}
          >
            {saving && status === "draft" ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save draft"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => save("submitted")}
            disabled={saving || !stepOneDone || !stepTwoDone}
          >
            Mark submitted
          </Button>
          <Button
            type="button"
            onClick={() => save()}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save A2P setup"
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}

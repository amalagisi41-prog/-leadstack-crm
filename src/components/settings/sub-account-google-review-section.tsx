"use client";

import { useEffect, useState, type FormEvent } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { GoogleGIcon } from "@/components/brand/google-g-icon";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  DEFAULT_REVIEW_COOLDOWN_DAYS,
  DEFAULT_REVIEW_SMS_TEMPLATE,
  normalizeReviewChannel,
  type ReviewChannel,
} from "@/lib/reviews/constants";
import type { WhatsappTemplateDoc } from "@/types/whatsapp-templates";

/**
 * Per-sub-account Google review-request setup. Enter the review link, pick the
 * channel (WhatsApp only lights up once there's an approved template), edit the
 * SMS message / pick the template, and choose whether it auto-sends on paid.
 */
export function SubAccountGoogleReviewSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const cfg = subAccount?.googleReviewConfig ?? null;

  const [reviewUrl, setReviewUrl] = useState("");
  const [channel, setChannel] = useState<ReviewChannel>("sms");
  const [messageTemplate, setMessageTemplate] = useState(
    DEFAULT_REVIEW_SMS_TEMPLATE,
  );
  const [whatsappTemplateId, setWhatsappTemplateId] = useState("");
  const [cooldownDays, setCooldownDays] = useState(DEFAULT_REVIEW_COOLDOWN_DAYS);
  const [autoOnPaid, setAutoOnPaid] = useState(true);
  const [autoOnDealCompleted, setAutoOnDealCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [approved, setApproved] = useState<
    Array<{ id: string; displayName: string }>
  >([]);

  // Re-sync local state when the sub-account snapshot lands / changes.
  useEffect(() => {
    setReviewUrl(cfg?.reviewUrl ?? "");
    setChannel(normalizeReviewChannel(cfg?.channel));
    setMessageTemplate(cfg?.messageTemplate || DEFAULT_REVIEW_SMS_TEMPLATE);
    setWhatsappTemplateId(cfg?.whatsappTemplateId ?? "");
    setCooldownDays(cfg?.cooldownDays ?? DEFAULT_REVIEW_COOLDOWN_DAYS);
    setAutoOnPaid(!!cfg?.enabled && !!cfg?.triggerOnQuotePaid);
    setAutoOnDealCompleted(!!cfg?.enabled && !!cfg?.triggerOnDealCompleted);
  }, [
    cfg?.reviewUrl,
    cfg?.channel,
    cfg?.messageTemplate,
    cfg?.whatsappTemplateId,
    cfg?.cooldownDays,
    cfg?.enabled,
    cfg?.triggerOnQuotePaid,
    cfg?.triggerOnDealCompleted,
  ]);

  // Approved WhatsApp templates power the channel gate + the picker.
  useEffect(() => {
    if (!subAccountId) return;
    const q = query(
      collection(getFirebaseDb(), `subAccounts/${subAccountId}/whatsappTemplates`),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setApproved(
          snap.docs
            .map((d) => ({ ...(d.data() as WhatsappTemplateDoc), id: d.id }))
            .filter((t) => t.status === "approved" && t.contentSid)
            .map((t) => ({ id: t.id, displayName: t.displayName })),
        );
      },
      () => setApproved([]),
    );
    return () => unsub();
  }, [subAccountId]);

  if (!isAdmin) return null;

  // WhatsApp manual (free-form, in-window) needs just the gate + a sender.
  // WhatsApp template additionally needs an approved template.
  const whatsappBaseReady =
    subAccount?.whatsappEnabledByAgency === true &&
    !!subAccount?.twilioConfig?.whatsappFromNumber;
  const whatsappTemplateReady = whatsappBaseReady && approved.length > 0;
  const connected = !!cfg?.reviewUrl;
  // WhatsApp Manual is free-form + in-window only, so it can't reliably fire on
  // a quote-paid event (the window is usually closed by then). Auto-send is
  // only meaningful for SMS + WhatsApp Template.
  const autoSupported = channel !== "whatsapp_manual";

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/google-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: autoSupported && (autoOnPaid || autoOnDealCompleted),
            reviewUrl: reviewUrl.trim(),
            channel,
            messageTemplate,
            whatsappTemplateId:
              channel === "whatsapp_template" ? whatsappTemplateId : null,
            cooldownDays,
            triggerOnQuotePaid: autoSupported && autoOnPaid,
            triggerOnDealCompleted: autoSupported && autoOnDealCompleted,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save review settings.");
      }
      toast.success("Google review settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!confirm("Turn off Google review requests and clear these settings?")) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/google-review`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to clear.");
      }
      toast.success("Google review requests turned off.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background">
          <GoogleGIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Google reviews</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ask customers for a Google review by SMS or WhatsApp — automatically
            after a quote/invoice is marked paid, or on demand from a contact.
            Find your link in Google Business Profile → &ldquo;Get more
            reviews&rdquo;.
          </p>
        </div>
      </header>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="gr-url">Google review link</Label>
          <Input
            id="gr-url"
            value={reviewUrl}
            onChange={(e) => setReviewUrl(e.target.value)}
            placeholder="https://g.page/r/…/review"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Channel</Label>
          <p className="text-[11px] text-muted-foreground">
            Review requests send on <strong>one</strong> channel — pick the one
            to use. The green outline marks the active channel.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ChannelOption
              active={channel === "sms"}
              disabled={false}
              label="SMS"
              hint="Free-form text"
              onClick={() => setChannel("sms")}
            />
            <ChannelOption
              active={channel === "whatsapp_template"}
              disabled={!whatsappTemplateReady}
              label="WhatsApp · Template"
              hint={
                whatsappTemplateReady
                  ? "Approved template — works anytime"
                  : "Needs an approved template"
              }
              onClick={() =>
                whatsappTemplateReady && setChannel("whatsapp_template")
              }
            />
            <ChannelOption
              active={channel === "whatsapp_manual"}
              disabled={!whatsappBaseReady}
              label="WhatsApp · Manual"
              hint={
                whatsappBaseReady
                  ? "Free-form, in-window — no template"
                  : "Needs a WhatsApp sender"
              }
              onClick={() => whatsappBaseReady && setChannel("whatsapp_manual")}
            />
          </div>
          {!whatsappBaseReady && (
            <p className="text-[11px] text-muted-foreground">
              WhatsApp needs the agency WhatsApp gate on + a sender configured
              (Settings → SMS). The <strong>Template</strong> mode also needs an
              approved review-request template (AI Agents → WhatsApp →
              Templates); <strong>Manual</strong> mode doesn&apos;t.
            </p>
          )}
        </div>

        {channel === "whatsapp_template" ? (
          <div className="space-y-1.5">
            <Label htmlFor="gr-tpl">Approved WhatsApp template</Label>
            <select
              id="gr-tpl"
              value={whatsappTemplateId}
              onChange={(e) => setWhatsappTemplateId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Select a template…</option>
              {approved.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              The review link is baked into the approved template body. Works for
              automatic sends even outside the 24h window.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="gr-msg">Message</Label>
            <Textarea
              id="gr-msg"
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {"Tags: {{firstName}}, {{businessName}}, {{reviewUrl}} — must include {{reviewUrl}}."}
              {channel === "whatsapp_manual" && (
                <>
                  {" "}
                  WhatsApp Manual only sends while the customer&apos;s 24h window
                  is open (e.g. they just messaged) — best used from the inbox
                  &ldquo;Ask for review&rdquo; button.
                </>
              )}
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="gr-cd">Don&apos;t re-ask within (days)</Label>
            <Input
              id="gr-cd"
              type="number"
              min={0}
              value={cooldownDays}
              onChange={(e) => setCooldownDays(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">
            Send automatically when…
          </p>
          <label
            className={cn(
              "flex items-center gap-2 text-sm",
              !autoSupported && "opacity-50",
            )}
          >
            <input
              type="checkbox"
              checked={autoSupported && autoOnPaid}
              onChange={(e) => setAutoOnPaid(e.target.checked)}
              disabled={!autoSupported}
              className="h-4 w-4 rounded border-input disabled:cursor-not-allowed"
            />
            A quote/invoice is marked paid
          </label>
          <label
            className={cn(
              "flex items-center gap-2 text-sm",
              !autoSupported && "opacity-50",
            )}
          >
            <input
              type="checkbox"
              checked={autoSupported && autoOnDealCompleted}
              onChange={(e) => setAutoOnDealCompleted(e.target.checked)}
              disabled={!autoSupported}
              className="h-4 w-4 rounded border-input disabled:cursor-not-allowed"
            />
            A Won deal is marked completed (from the pipeline card)
          </label>
          {!autoSupported && (
            <p className="text-[11px] text-muted-foreground">
              WhatsApp Manual can&apos;t auto-send — it only works while the
              customer&apos;s 24h window is open. Use it from the inbox
              &ldquo;Ask for review&rdquo; button, or pick SMS / WhatsApp
              Template for automatic sends.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          {connected && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={clearing}
            >
              {clearing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Turn off
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={
              saving ||
              !reviewUrl.trim() ||
              (channel === "whatsapp_template" && !whatsappTemplateId)
            }
          >
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </form>
    </section>
  );
}

function ChannelOption({
  active,
  disabled,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-1 items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
        active
          ? "border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500/40"
          : "hover:bg-muted",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
          active ? "border-emerald-500" : "border-muted-foreground/40",
        )}
      >
        {active && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

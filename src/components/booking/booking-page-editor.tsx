"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { collection, onSnapshot } from "firebase/firestore";
import {
  AlertTriangle,
  HelpCircle,
  Loader2,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getFirebaseDb } from "@/lib/firebase/client";
import { useSubAccount } from "@/context/sub-account-context";
import type { SubAccountMemberDoc } from "@/types/tenancy";
import { TerritorySelectField } from "@/components/settings/territory-select-field";
import { WorkingHoursGrid } from "@/components/booking/working-hours-grid";
import { IntakeFieldBuilder } from "@/components/booking/intake-field-builder";
import { BookingHelpDialog } from "@/components/booking/booking-help-dialog";
import { TeamBookingHelpDialog } from "@/components/booking/team-booking-help-dialog";
import {
  defaultBookingPageFormData,
  detectTimezone,
} from "@/lib/booking/defaults";
import {
  DEFAULT_PAYMENT_HOLD_HOURS,
  type BookingPage,
  type BookingPageFormData,
  type BookingPayment,
} from "@/types/booking";

/**
 * Booking page editor — used for both create (mode="new") and edit
 * (mode="edit"). The form is one long page (mirrors the existing
 * Website builder pattern), grouped into sections so the operator can
 * scan + jump.
 *
 * Submits to:
 *   - POST   /api/sub-accounts/[saId]/booking-pages         (mode "new")
 *   - PATCH  /api/sub-accounts/[saId]/booking-pages/[slug]  (mode "edit")
 *
 * Delete lives here too (edit mode only) so the operator has all
 * page-level actions in one surface; delete confirms inline.
 */

interface Props {
  mode: "new" | "edit";
  /** Hydration for edit mode. Ignored for new. */
  initial?: BookingPage;
}

const DURATIONS = [15, 30, 45, 60, 75, 90, 120] as const;
const BUFFERS = [0, 5, 10, 15, 30, 45, 60] as const;
const CURRENCIES = ["USD", "AUD", "EUR", "GBP", "CAD"] as const;

// Curated common timezones at the top, then the runtime's full list.
// Operators on Australia/Sydney shouldn't have to scroll past Africa/* to
// find the right one.
const COMMON_TIMEZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Pacific/Auckland",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "UTC",
];

function allTimezones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    if (typeof supported === "function") return supported("timeZone");
  } catch {
    /* fall through */
  }
  return COMMON_TIMEZONES;
}

export function BookingPageEditor({ mode, initial }: Props) {
  const router = useRouter();
  const { subAccountId, subAccount, saPath } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const hasPaypal = !!subAccount?.paypalConfig;

  const hydrated: BookingPageFormData = useMemo(() => {
    if (mode === "edit" && initial) {
      return {
        slug: initial.slug,
        name: initial.name,
        description: initial.description,
        status: initial.status,
        durationMinutes: initial.durationMinutes,
        bufferMinutes: initial.bufferMinutes,
        workingHours: initial.workingHours,
        timezone: initial.timezone,
        visibleDays: initial.visibleDays,
        minNoticeHours: initial.minNoticeHours,
        maxPerDay: initial.maxPerDay,
        intakeFields: initial.intakeFields,
        hosts: initial.hosts ?? [],
        logoUrl: initial.logoUrl,
        accentColor: initial.accentColor,
        meetingUrl: initial.meetingUrl ?? null,
        confirmationMessage: initial.confirmationMessage,
        redirectUrl: initial.redirectUrl ?? null,
        redirectAppendParams: initial.redirectAppendParams ?? true,
        remindersEnabled: initial.remindersEnabled,
        reminderOffsetsMinutes: initial.reminderOffsetsMinutes,
        payment: initial.payment,
        defaultTerritoryId: initial.defaultTerritoryId,
      };
    }
    return defaultBookingPageFormData(
      // Slug seeded blank in new-mode so the operator types it explicitly;
      // we'll auto-suggest from the name on blur in the input below.
      "",
      detectTimezone(),
    );
  }, [mode, initial]);

  const [form, setForm] = useState<BookingPageFormData>(hydrated);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [teamHelpOpen, setTeamHelpOpen] = useState(false);

  // Stay in sync if the initial doc refreshes mid-edit (onSnapshot).
  useEffect(() => {
    if (mode === "edit") setForm(hydrated);
  }, [mode, hydrated]);

  function set<K extends keyof BookingPageFormData>(
    key: K,
    value: BookingPageFormData[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Active sub-account members → selectable hosts. Empty selection keeps the
  // single shared schedule; one+ flips the page into team mode.
  const [members, setMembers] = useState<{ uid: string; name: string }[]>([]);
  useEffect(() => {
    if (!subAccountId) return;
    const unsub = onSnapshot(
      collection(getFirebaseDb(), `subAccounts/${subAccountId}/subAccountMembers`),
      (snap) => {
        setMembers(
          snap.docs
            .map((d) => d.data() as SubAccountMemberDoc)
            .filter((m) => m.status === "active")
            .map((m) => ({
              uid: m.uid,
              name: m.displayName || m.email || "Member",
            })),
        );
      },
      () => setMembers([]),
    );
    return () => unsub();
  }, [subAccountId]);

  function toggleHost(uid: string, name: string, checked: boolean) {
    const current = form.hosts ?? [];
    if (checked) {
      if (current.some((h) => h.uid === uid)) return;
      set("hosts", [...current, { uid, name }]);
    } else {
      set(
        "hosts",
        current.filter((h) => h.uid !== uid),
      );
    }
  }

  function togglePayment(enabled: boolean) {
    if (!enabled) {
      set("payment", null);
      return;
    }
    const next: BookingPayment = form.payment ?? {
      amount: 50,
      currency: "USD",
      description: null,
      holdHours: DEFAULT_PAYMENT_HOLD_HOURS,
    };
    set("payment", next);
  }

  function setPayment<K extends keyof BookingPayment>(
    key: K,
    value: BookingPayment[K],
  ) {
    if (!form.payment) return;
    set("payment", { ...form.payment, [key]: value });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const url =
        mode === "new"
          ? `/api/sub-accounts/${subAccountId}/booking-pages`
          : `/api/sub-accounts/${subAccountId}/booking-pages/${form.slug}`;
      const method = mode === "new" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        slug?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not save.");
      }
      toast.success(
        mode === "new" ? "Booking page created." : "Saved.",
      );
      if (mode === "new") {
        router.push(saPath(`/booking/${data.slug ?? form.slug}`));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (mode !== "edit") return;
    if (
      !confirm(
        `Delete "${form.name}"? The public link stops working immediately. Past bookings stay in the calendar.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/booking-pages/${form.slug}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        futureCount?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not delete.");
      }
      toast.success("Deleted.");
      router.push(saPath("/booking"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  }

  const timezoneList = useMemo(() => allTimezones(), []);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setHelpOpen(true)}
        >
          <HelpCircle className="mr-1 h-3.5 w-3.5" />
          How it works
        </Button>
      </div>

      <BookingHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <TeamBookingHelpDialog
        open={teamHelpOpen}
        onOpenChange={setTeamHelpOpen}
      />

      {/* ── Basics ─────────────────────────────────────────────── */}
      <Section
        title="Basics"
        description="What this page is, and the URL slug visitors see."
      >
        <Field label="Page name" htmlFor="name" required>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="30-minute consultation"
            maxLength={80}
            required
          />
        </Field>

        <Field
          label="URL slug"
          htmlFor="slug"
          required
          hint={
            mode === "edit"
              ? "Slug can't be changed after creation — public links would break."
              : "Lowercase letters, numbers, and hyphens. 1–48 chars."
          }
        >
          <Input
            id="slug"
            value={form.slug}
            onChange={(e) =>
              set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))
            }
            onBlur={(e) => {
              if (mode === "new" && !e.target.value && form.name) {
                set(
                  "slug",
                  form.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "")
                    .slice(0, 48),
                );
              }
            }}
            placeholder="30-min-consult"
            maxLength={48}
            disabled={mode === "edit"}
            required
          />
        </Field>

        <Field
          label="Description"
          htmlFor="description"
          hint="Shown on the public page above the slot picker. Markdown supported."
        >
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Spend 30 minutes with our team to map out…"
          />
        </Field>

        <Field
          label="Meeting URL"
          htmlFor="meetingUrl"
          hint="Zoom, Google Meet, Whereby, or any video-call URL. Added to the confirmation email + the calendar invite (.ics LOCATION) so attendees can join with one click. Leave blank for in-person meetings or if you'll send the link separately."
        >
          <Input
            id="meetingUrl"
            type="url"
            value={form.meetingUrl ?? ""}
            onChange={(e) =>
              set(
                "meetingUrl",
                e.target.value.trim().length > 0 ? e.target.value.trim() : null,
              )
            }
            maxLength={1000}
            placeholder="https://zoom.us/j/1234567890"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Status"
          htmlFor="status"
          hint="Drafts are invisible to visitors. Publish when you're ready to share the link."
        >
          <select
            id="status"
            value={form.status}
            onChange={(e) =>
              set("status", e.target.value as "draft" | "published")
            }
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
          >
            <option value="draft">Draft (hidden)</option>
            <option value="published">Published (public)</option>
          </select>
        </Field>
      </Section>

      {/* ── Slot rules ─────────────────────────────────────────── */}
      <Section
        title="Slot rules"
        description="How long meetings run, how far ahead visitors can book, and when you're available."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Duration" htmlFor="duration">
            <select
              id="duration"
              value={form.durationMinutes}
              onChange={(e) =>
                set("durationMinutes", Number(e.target.value))
              }
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Buffer between meetings"
            htmlFor="buffer"
            hint="Time to breathe between back-to-back bookings."
          >
            <select
              id="buffer"
              value={form.bufferMinutes}
              onChange={(e) => set("bufferMinutes", Number(e.target.value))}
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
            >
              {BUFFERS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "None" : `${d} minutes`}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Timezone" htmlFor="timezone">
          <select
            id="timezone"
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
          >
            <optgroup label="Common">
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </optgroup>
            {timezoneList.length > COMMON_TIMEZONES.length && (
              <optgroup label="All">
                {timezoneList
                  .filter((tz) => !COMMON_TIMEZONES.includes(tz))
                  .map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </Field>

        <WorkingHoursGrid
          value={form.workingHours}
          onChange={(next) => set("workingHours", next)}
          disabled={saving}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Visible days"
            htmlFor="visibleDays"
            hint="How far into the future visitors can book."
          >
            <Input
              id="visibleDays"
              type="number"
              min={1}
              max={90}
              value={form.visibleDays}
              onChange={(e) => set("visibleDays", Number(e.target.value))}
            />
          </Field>
          <Field
            label="Min notice (hours)"
            htmlFor="minNotice"
            hint="Block bookings closer than this to now."
          >
            <Input
              id="minNotice"
              type="number"
              min={0}
              max={168}
              value={form.minNoticeHours}
              onChange={(e) =>
                set("minNoticeHours", Number(e.target.value))
              }
            />
          </Field>
          <Field
            label="Max per day"
            htmlFor="maxPerDay"
            hint="Cap on bookings per day. Leave blank for unlimited."
          >
            <Input
              id="maxPerDay"
              type="number"
              min={1}
              max={100}
              value={form.maxPerDay ?? ""}
              onChange={(e) =>
                set(
                  "maxPerDay",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              placeholder="Unlimited"
            />
          </Field>
        </div>
      </Section>

      {/* ── Hosts / team ───────────────────────────────────────── */}
      <Section
        title="Hosts / team"
        description="Add team members to run this page as a shared team calendar. Leave empty for a single shared schedule."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTeamHelpOpen(true)}
          >
            <HelpCircle className="mr-1 h-3.5 w-3.5" />
            How it works
          </Button>
        }
      >
        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No active members to add yet. Invite teammates under Settings →
            Members, then assign them here to enable team booking.
          </p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => {
              const checked = (form.hosts ?? []).some((h) => h.uid === m.uid);
              return (
                <label
                  key={m.uid}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border bg-background p-3"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      toggleHost(m.uid, m.name, e.target.checked)
                    }
                    disabled={saving}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {m.name}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {(form.hosts ?? []).length > 0
            ? "Team mode: a time stays open while any selected host is free, and each booking is auto-assigned to the least-busy host (the customer doesn't pick)."
            : "Single shared schedule: everyone shares one calendar — a time closes once any one booking lands (today's behavior)."}
        </p>
      </Section>

      {/* ── Intake form ────────────────────────────────────────── */}
      <Section
        title="Intake form"
        description="Optional extra questions on the booking form."
      >
        <IntakeFieldBuilder
          value={form.intakeFields}
          onChange={(next) => set("intakeFields", next)}
          disabled={saving}
        />
      </Section>

      {/* ── Confirmation + reminders ───────────────────────────── */}
      <Section
        title="Confirmation + reminders"
        description="What visitors see after booking, plus automated reminders."
      >
        <Field
          label="Confirmation message"
          htmlFor="confirmation"
          hint="Markdown. Shown on the thank-you page and in the confirmation email."
        >
          <Textarea
            id="confirmation"
            value={form.confirmationMessage}
            onChange={(e) => set("confirmationMessage", e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Looking forward to chatting! Add the calendar invite to your calendar to lock it in."
          />
        </Field>
        <Field
          label="Redirect URL (optional)"
          htmlFor="redirectUrl"
          hint="After a confirmed booking, send visitors here (e.g. a thank-you or upsell page). We briefly show the confirmation, then redirect — appending ?booking_id & email for tracking. Paid booking pages never redirect. Leave blank to stay on the confirmation screen."
        >
          <Input
            id="redirectUrl"
            type="url"
            inputMode="url"
            value={form.redirectUrl ?? ""}
            onChange={(e) =>
              set(
                "redirectUrl",
                e.target.value.trim().length > 0 ? e.target.value.trim() : null,
              )
            }
            maxLength={1000}
            placeholder="https://yourdomain.com/thank-you"
          />
        </Field>
        {form.redirectUrl && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3">
            <input
              type="checkbox"
              checked={form.redirectAppendParams ?? true}
              onChange={(e) => set("redirectAppendParams", e.target.checked)}
              className="mt-0.5 h-4 w-4 cursor-pointer"
            />
            <div>
              <p className="text-sm font-medium">
                Append booking details to the redirect URL
              </p>
              <p className="text-xs text-muted-foreground">
                Adds <code>?booking_id</code> and <code>email</code> so your
                thank-you page can fire conversion pixels and de-dup
                bookings. Turn off to send visitors to the bare URL — the
                booker&apos;s email won&apos;t appear in the destination&apos;s
                address bar, referrer, or logs.
              </p>
            </div>
          </label>
        )}
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3">
          <input
            type="checkbox"
            checked={form.remindersEnabled}
            onChange={(e) => set("remindersEnabled", e.target.checked)}
            className="mt-0.5 h-4 w-4 cursor-pointer"
          />
          <div>
            <p className="text-sm font-medium">
              Send T-24h and T-1h reminders
            </p>
            <p className="text-xs text-muted-foreground">
              Two emails per booking: 24 hours before, and 1 hour before.
              Skipped when a booking is cancelled or still awaiting
              payment. Custom offsets are a v1.1 add-on.
            </p>
          </div>
        </label>
      </Section>

      {/* ── Payment (gated on subAccount.paypalConfig) ─────────── */}
      <Section
        title="Payment"
        description={
          hasPaypal
            ? "Require a PayPal.me deposit before the slot is confirmed. You mark each booking paid manually once the funds land."
            : "Connect a PayPal.me username under Settings → Payments to require deposits."
        }
      >
        {!hasPaypal && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Payment requires PayPal.me. Once you connect it, this
              section enables.
            </span>
          </div>
        )}
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 ${
            !hasPaypal ? "opacity-50" : ""
          }`}
        >
          <input
            type="checkbox"
            checked={!!form.payment}
            onChange={(e) => togglePayment(e.target.checked)}
            disabled={!hasPaypal}
            className="mt-0.5 h-4 w-4 cursor-pointer"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              Require deposit to confirm the booking
            </p>
            <p className="text-xs text-muted-foreground">
              The slot is held in &ldquo;awaiting payment&rdquo; until you
              mark it paid. Unpaid holds auto-cancel after the window
              below.
            </p>
          </div>
        </label>

        {form.payment && (
          <div className="ml-7 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
              <Field label="Amount" htmlFor="payment-amount">
                <Input
                  id="payment-amount"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={form.payment.amount}
                  onChange={(e) =>
                    setPayment("amount", Number(e.target.value))
                  }
                  required
                />
              </Field>
              <Field label="Currency" htmlFor="payment-currency">
                <select
                  id="payment-currency"
                  value={form.payment.currency}
                  onChange={(e) => setPayment("currency", e.target.value)}
                  className="flex h-9 w-24 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Hold window (hours)"
                htmlFor="payment-hold"
                hint="Auto-cancel if unpaid"
              >
                <Input
                  id="payment-hold"
                  type="number"
                  min={1}
                  max={168}
                  className="w-24"
                  value={form.payment.holdHours}
                  onChange={(e) =>
                    setPayment("holdHours", Number(e.target.value))
                  }
                />
              </Field>
            </div>
            <Field
              label="Description (optional)"
              htmlFor="payment-description"
              hint="Shown to the visitor next to the Pay button."
            >
              <Input
                id="payment-description"
                value={form.payment.description ?? ""}
                onChange={(e) =>
                  setPayment(
                    "description",
                    e.target.value.length > 0 ? e.target.value : null,
                  )
                }
                placeholder="Consultation deposit"
                maxLength={120}
              />
            </Field>
          </div>
        )}
      </Section>

      {/* ── Territory (gated on subAccount.territoryScopingEnabled) ── */}
      {scopingOn && (
        <Section
          title="Territory"
          description="Auto-tag contacts who book this page into a specific territory. Defaults to Global (visible to every rep)."
        >
          <TerritorySelectField
            id="defaultTerritoryId"
            label="Default territory for new leads"
            value={form.defaultTerritoryId}
            onChange={(next) => set("defaultTerritoryId", next)}
            disabled={saving}
          />
        </Section>
      )}

      {/* ── Visual ─────────────────────────────────────────────── */}
      <Section
        title="Visual"
        description="Override the sub-account's branding for this page. Leave blank to inherit."
      >
        <Field
          label="Logo URL"
          htmlFor="logoUrl"
          hint="Public HTTPS URL. Falls back to the sub-account logo."
        >
          <Input
            id="logoUrl"
            value={form.logoUrl ?? ""}
            onChange={(e) =>
              set("logoUrl", e.target.value.length > 0 ? e.target.value : null)
            }
            placeholder="https://…"
            type="url"
          />
        </Field>
        <Field
          label="Accent color"
          htmlFor="accentColor"
          hint="Hex like #5B5BD6."
        >
          <Input
            id="accentColor"
            value={form.accentColor ?? ""}
            onChange={(e) =>
              set(
                "accentColor",
                e.target.value.length > 0 ? e.target.value : null,
              )
            }
            placeholder="#5B5BD6"
            className="w-32"
          />
        </Field>
      </Section>

      {/* ── Submit + delete ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        {mode === "edit" ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            {deleting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1 h-4 w-4" />
            )}
            Delete page
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(saPath("/booking"))}
            disabled={saving || deleting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving || deleting}>
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            {mode === "new" ? "Create page" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  /** Optional control rendered at the top-right of the section header. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

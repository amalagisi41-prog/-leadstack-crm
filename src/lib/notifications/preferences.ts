import type {
  NotificationChannel,
  NotificationEventKey,
  NotificationPreferences,
} from "@/types";

export const NOTIFICATION_CHANNELS = [
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" },
] as const satisfies ReadonlyArray<{
  key: NotificationChannel;
  label: string;
}>;

export const NOTIFICATION_EVENTS = [
  {
    key: "new_lead",
    label: "New lead captured",
    description: "Get notified when a fresh lead lands in your pipeline.",
  },
  {
    key: "showing_booked",
    label: "Showing booked",
    description: "Know when a showing or consultation gets scheduled.",
  },
  {
    key: "task_due",
    label: "Task reminders",
    description: "Stay ahead of due and overdue follow-ups.",
  },
  {
    key: "deal_stage_changed",
    label: "Deal stage changes",
    description: "See when a deal moves forward, stalls, or closes.",
  },
  {
    key: "review_activity",
    label: "Review activity",
    description: "Track review requests and new feedback.",
  },
  {
    key: "billing_updates",
    label: "Billing updates",
    description: "Invoices, renewals, payment issues, and cancellations.",
  },
] as const satisfies ReadonlyArray<{
  key: NotificationEventKey;
  label: string;
  description: string;
}>;

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    new_lead: {
      sms: true,
      email: true,
      push: true,
    },
    showing_booked: {
      sms: true,
      email: true,
      push: true,
    },
    task_due: {
      sms: false,
      email: true,
      push: true,
    },
    deal_stage_changed: {
      sms: false,
      email: true,
      push: true,
    },
    review_activity: {
      sms: false,
      email: true,
      push: true,
    },
    billing_updates: {
      sms: false,
      email: true,
      push: true,
    },
  };
}

export function normalizeNotificationPreferences(
  input?: Partial<NotificationPreferences> | null,
): NotificationPreferences {
  const fallback = defaultNotificationPreferences();
  const next = {} as NotificationPreferences;

  for (const event of NOTIFICATION_EVENTS) {
    const source = input?.[event.key];
    next[event.key] = {
      sms: source?.sms ?? fallback[event.key].sms,
      email: source?.email ?? fallback[event.key].email,
      push: source?.push ?? fallback[event.key].push,
    };
  }

  return next;
}

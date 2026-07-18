import { CUSTOM_BRAND } from "@/config/landing";
import type { BriefingStats } from "./compute";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

interface BriefingLine {
  label: string;
  value: string;
  href?: string;
}

function buildLines(
  stats: BriefingStats,
  links: { tasks: string; contacts: string; calendar: string; pipeline: string; conversations: string },
): BriefingLine[] {
  const lines: BriefingLine[] = [];
  if (stats.newLeads > 0) {
    lines.push({
      label: "New leads",
      value: `${stats.newLeads}`,
      href: links.contacts,
    });
  }
  if (stats.tasksDueToday > 0) {
    lines.push({
      label: "Tasks due today",
      value: `${stats.tasksDueToday}`,
      href: links.tasks,
    });
  }
  if (stats.tasksOverdue > 0) {
    lines.push({
      label: "Overdue tasks",
      value: `${stats.tasksOverdue}`,
      href: links.tasks,
    });
  }
  if (stats.appointmentsToday > 0) {
    lines.push({
      label: "Appointments today",
      value: `${stats.appointmentsToday}`,
      href: links.calendar,
    });
  }
  if (stats.dealsWon > 0) {
    lines.push({
      label: "Deals won (last 24h)",
      value: `${stats.dealsWon} · ${money(stats.dealsWonValue)}`,
      href: links.pipeline,
    });
  }
  if (stats.escalatedChats > 0) {
    lines.push({
      label: "Chats waiting on you",
      value: `${stats.escalatedChats}`,
      href: links.conversations,
    });
  }
  return lines;
}

/** Renders the Daily Briefing email. Pure — no I/O, unit-testable. */
export function renderDailyBriefingEmail(opts: {
  businessName: string;
  stats: BriefingStats;
  dashboardUrl: string;
  tasksUrl: string;
  contactsUrl: string;
  calendarUrl: string;
  pipelineUrl: string;
  conversationsUrl: string;
  todayLabel: string;
}): { subject: string; text: string; html: string } {
  const lines = buildLines(opts.stats, {
    tasks: opts.tasksUrl,
    contacts: opts.contactsUrl,
    calendar: opts.calendarUrl,
    pipeline: opts.pipelineUrl,
    conversations: opts.conversationsUrl,
  });

  const headline =
    lines.length === 0
      ? "Nothing urgent — inbox is clear."
      : lines.map((l) => `${l.value} ${l.label.toLowerCase()}`).join(" · ");

  const subject =
    lines.length === 0
      ? `Your ${opts.todayLabel} briefing — all clear`
      : `Your ${opts.todayLabel} briefing: ${headline}`;

  const text = [
    `Good morning — here's ${opts.businessName}'s ${opts.todayLabel} briefing.`,
    "",
    lines.length === 0
      ? "Nothing urgent today. Inbox is clear."
      : lines.map((l) => `• ${l.value} ${l.label.toLowerCase()}`).join("\n"),
    "",
    `Open your dashboard: ${opts.dashboardUrl}`,
  ].join("\n");

  const rows = lines
    .map(
      (l) => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
          <a href="${l.href ?? opts.dashboardUrl}" style="color: #1a1a1a; text-decoration: none; font-size: 14px;">
            <strong style="font-size: 18px; color: #1d4ed8;">${l.value}</strong>
            &nbsp;${l.label}
          </a>
        </td>
      </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">
        ${opts.todayLabel} briefing
      </p>
      <h2 style="margin: 0 0 16px;">${opts.businessName}</h2>
      ${
        lines.length === 0
          ? `<p>Nothing urgent today — inbox is clear. 🎉</p>`
          : `<table style="width: 100%; border-collapse: collapse;">${rows}</table>`
      }
      <p style="margin: 24px 0;">
        <a href="${opts.dashboardUrl}" style="background: #1d4ed8; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
          Open dashboard
        </a>
      </p>
      <p style="color: #9ca3af; font-size: 12px;">
        Sent by ${CUSTOM_BRAND.name}. Turn this off anytime in Settings → Daily briefing.
      </p>
    </div>
  `;

  return { subject, text, html };
}

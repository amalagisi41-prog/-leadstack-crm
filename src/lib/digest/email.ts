import { CUSTOM_BRAND } from "@/config/landing";
import type { WeeklyDigest } from "@middleware/digest/types";

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

interface DigestLine {
  label: string;
  value: string;
}

function buildLines(digest: WeeklyDigest): DigestLine[] {
  const lines: DigestLine[] = [
    { label: "AI replies sent", value: `${digest.repliesSent}` },
    { label: "Bookings created", value: `${digest.bookingsCreated}` },
    { label: "Cold leads revived", value: `${digest.leadsRevived}` },
  ];
  if (digest.dealsWon > 0) {
    lines.push({
      label: "Deals won",
      value: `${digest.dealsWon} · ${money(digest.dealsWonValue)}`,
    });
  }
  return lines;
}

/** Renders the Weekly Digest email. Pure — no I/O, unit-testable. */
export function renderWeeklyDigestEmail(opts: {
  businessName: string;
  digest: WeeklyDigest;
  dashboardUrl: string;
}): { subject: string; text: string; html: string } {
  const lines = buildLines(opts.digest);

  const subject = `Your AI employee this week: ${opts.digest.headline}`;

  const text = [
    `Here's ${opts.businessName}'s week — your AI employee's report card.`,
    "",
    lines.map((l) => `• ${l.value} — ${l.label}`).join("\n"),
    "",
    `Open your dashboard: ${opts.dashboardUrl}`,
  ].join("\n");

  const rows = lines
    .map(
      (l) => `
      <tr>
        <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
          <strong style="font-size: 18px; color: #1d4ed8;">${l.value}</strong>
          &nbsp;<span style="color: #1a1a1a; font-size: 14px;">${l.label}</span>
        </td>
      </tr>`,
    )
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p style="color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px;">
        Weekly digest
      </p>
      <h2 style="margin: 0 0 4px;">${opts.businessName}</h2>
      <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">Your AI employee's week</p>
      <table style="width: 100%; border-collapse: collapse;">${rows}</table>
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

import { PublicInfoShell } from "@/components/public/public-info-shell";
import {
  AVAILABILITY_STYLES,
  PUBLIC_CAPABILITIES,
} from "@/lib/public-site/capability-status";

export default function AvailabilityPage() {
  return (
    <PublicInfoShell
      eyebrow="Feature availability"
      title="A working core, with the roadmap clearly labeled."
      intro="AgentStack Solo is focused on one measurable outcome: capture a lead, respond with an approved workflow, nurture the relationship, and book an appointment. Availability labels describe what a new subscriber can use today."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {PUBLIC_CAPABILITIES.map((item) => (
          <article
            key={item.name}
            className="rounded-2xl border border-[#E7DCC7] bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-semibold">{item.name}</h2>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${AVAILABILITY_STYLES[item.availability]}`}
              >
                {item.availability}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#526078]">
              {item.description}
            </p>
          </article>
        ))}
      </div>
    </PublicInfoShell>
  );
}

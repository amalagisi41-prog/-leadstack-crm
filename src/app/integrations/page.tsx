import { PublicInfoShell } from "@/components/public/public-info-shell";

const integrations = [
  [
    "Stripe",
    "Live",
    "Solo checkout, trials, subscription lifecycle, and customer billing portal.",
  ],
  ["Firebase", "Live", "Authentication, workspace data, and tenant isolation."],
  [
    "Resend",
    "Private Preview",
    "Email delivery after sender-domain configuration.",
  ],
  [
    "Twilio",
    "Private Preview",
    "SMS, WhatsApp, and phone provisioning after compliance setup.",
  ],
  [
    "OpenRouter + OpenAI",
    "Private Preview",
    "AI replies, assistants, and knowledge retrieval when provider keys are configured.",
  ],
  [
    "Vapi",
    "Private Preview",
    "Inbound and outbound AI voice after number and consent setup.",
  ],
  [
    "IDX Broker",
    "Private Preview",
    "Per-subscriber property search using the subscriber's own IDX credentials.",
  ],
  [
    "Meta",
    "Private Preview",
    "Facebook and Instagram publishing and inbox connections.",
  ],
  [
    "Google Business Profile",
    "Coming Soon",
    "Guided connection and local presence workflows.",
  ],
] as const;

export default function IntegrationsPage() {
  return (
    <PublicInfoShell
      eyebrow="Integrations"
      title="Connected deliberately—not advertised by checkbox."
      intro="An integration is labeled Live only when its subscriber flow works end to end. Private Preview integrations require configuration, approval, or a guided activation step."
    >
      <div className="overflow-hidden rounded-2xl border border-[#E7DCC7] bg-white">
        {integrations.map(([name, status, description]) => (
          <div
            key={name}
            className="grid gap-2 border-b border-[#EFE4D3] p-5 last:border-0 sm:grid-cols-[160px_140px_1fr]"
          >
            <strong>{name}</strong>
            <span className="text-sm font-semibold text-[#DB4F9B]">
              {status}
            </span>
            <p className="text-sm leading-6 text-[#526078]">{description}</p>
          </div>
        ))}
      </div>
    </PublicInfoShell>
  );
}

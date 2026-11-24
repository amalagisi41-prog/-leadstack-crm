import type { Metadata } from "next";
import Link from "next/link";
import { AGENTSTACK_METHOD_NAME } from "@/config/landing";
import { PlaybookCaptureForm } from "@/components/landing-custom/playbook-capture-form";
export const metadata: Metadata = {
  title: "The AgentStack Method™ — AgentStack CRM",
  description:
    "The AgentStack CRM playbook for realtors: Build, Connect, Capture, Respond, Nurture, and Close, from buyer inquiry to booked appointment.",
  alternates: { canonical: "/playbook" },
  openGraph: { title: "The AgentStack Method™ — AgentStack CRM" },
  twitter: { title: "The AgentStack Method™ — AgentStack CRM" },
};
const steps = [
  {
    name: "Build",
    agent:
      "Describe your brokerage, services, farm areas, hours, and preferred next actions in your Business Blueprint.",
    system:
      "Guided setup saves your business context and provides a starting point for your lead-to-appointment workflow. Review AI-generated instructions before use; AI Assist is Private Preview.",
    result:
      "A saved business profile and one clear next setup action. Aim to complete your initial setup in about fifteen minutes; connections and approvals can take longer.",
  },
  {
    name: "Connect",
    agent:
      "Import your GoHighLevel contacts as CSV and connect the channels you intend to use. Keep your own IDX Broker account for listing search.",
    system:
      "The import preview checks contact rows and duplicates. Connected channels use workspace-specific settings. SMS and voice automation and IDX listings are Private Preview.",
    result:
      "A checked sample of imported contacts and a tested connection for each enabled channel.",
  },
  {
    name: "Capture",
    agent:
      "Create an open-house or buyer-consultation lead form and publish its hosted link where prospects can find it.",
    system:
      "A valid form submission creates or reconciles a contact in your workspace. Lead forms and booking pages are Live.",
    result:
      "One test inquiry appears in People with the expected contact information and source.",
  },
  {
    name: "Respond",
    agent:
      "Review your first-response message, consent requirements, persona, and human handoff instructions before enabling an approved workflow.",
    system:
      "Configured messaging can respond while you are at a showing. AI Web Chat and AI Assist, and SMS and voice automation, are Private Preview and depend on channel configuration.",
    result:
      "Target a first response under 60 seconds. Measure a test inquiry from submission to delivery; this is a workflow goal, not a guaranteed result.",
  },
  {
    name: "Nurture",
    agent:
      "Review the next action for each buyer or seller, decide when a personal call is needed, and keep follow-up appropriate to the relationship.",
    system:
      "People, deals, tasks, and calendar keep next actions visible. Configured automated messaging remains Private Preview; review its timing and stop conditions before activation.",
    result:
      "Each active inquiry has a next action and due date, and you can count how many conversations become consultations.",
  },
  {
    name: "Close",
    agent:
      "Share a buyer-consultation booking page, prepare for the appointment, then move the deal through offers and closing as the transaction progresses.",
    system:
      "Booking pages present available slots and create appointment records. Your pipeline keeps the transaction and closing tasks in one workspace.",
    result:
      "A confirmed appointment in your calendar, followed by a current deal stage and a clear next task. Track appointments booked and completed transactions over time.",
  },
];
export default function PlaybookPage() {
  return (
    <main className="min-h-screen bg-[#FFF8EF] text-[#173B7A]">
      <article className="prose mx-auto max-w-3xl px-4 pt-12">
        <Link href="/">Back to AgentStack CRM</Link>
        <h1>{AGENTSTACK_METHOD_NAME}</h1>
        <p>
          A working realtor’s path from a new inquiry to a booked consultation.
          Start with the Live core, then activate preview channels only after
          reviewing availability and testing your setup.
        </p>
        {steps.map((step) => (
          <section key={step.name}>
            <h2>{step.name}</h2>
            <h3>What you do</h3>
            <p>{step.agent}</p>
            <h3>What the system does</h3>
            <p>{step.system}</p>
            <h3>What you measure</h3>
            <p>{step.result}</p>
          </section>
        ))}
        <h2>One complete lead-to-appointment workflow</h2>
        <ol>
          <li>
            Build your profile around buyer consultations in your farm area and
            confirm your business hours.
          </li>
          <li>
            Import your warm GoHighLevel contacts and configure a booking page
            with the correct timezone, hosts, duration, and working hours.
          </li>
          <li>
            Publish an open-house lead form. Submit a test buyer inquiry and
            confirm the contact appears in People.
          </li>
          <li>
            Review the inquiry and send a first response with the
            buyer-consultation booking link. If using Private Preview
            automation, first confirm the channel and consent are ready and time
            the test delivery.
          </li>
          <li>
            Follow up with a relevant next action while the buyer decides. Keep
            tasks current and review any enabled automated sequence.
          </li>
          <li>
            The buyer selects an available slot. Verify the appointment in your
            calendar and the confirmation. Review the buyer’s needs before the
            meeting, then update the deal’s next action.
          </li>
        </ol>
        <p>
          Success means one actual captured inquiry and one confirmed
          appointment. Compare your own response time and appointment count as
          you refine the workflow.
        </p>
        <p>
          <Link href="/availability">Check feature availability</Link> ·{" "}
          <Link href="/help/booking-pages">Set up booking pages</Link>
        </p>
        <p>
          <Link href="/signup">Create your AgentStack CRM workspace</Link>
        </p>
      </article>
      <PlaybookCaptureForm />
    </main>
  );
}

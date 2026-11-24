import type { Metadata } from "next";
import Link from "next/link";
import { Pricing } from "@/components/landing-custom/pricing";
export const metadata: Metadata = {
  title: "Pricing — AgentStack CRM",
  description:
    "AgentStack CRM Solo pricing, included Live features, Private Preview availability, and cancellation details.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Pricing — AgentStack CRM" },
  twitter: { title: "Pricing — AgentStack CRM" },
};
export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-[#173B7A]">
      <nav className="mx-auto flex max-w-5xl gap-6 px-4 pt-8">
        <Link href="/">AgentStack CRM</Link>
        <Link href="/help">Help</Link>
        <Link href="/signup">Create a workspace</Link>
      </nav>
      <h1 className="mt-12 text-center text-4xl font-semibold">
        Pricing — AgentStack CRM
      </h1>
      <Pricing />
      <section className="prose mx-auto max-w-3xl px-4 pb-16">
        <h2>Pricing questions</h2>
        <h3>Can I import my GoHighLevel contacts?</h3>
        <p>
          Yes, export a CSV and review the field mapping and duplicate preview.{" "}
          <Link href="/help/import-contacts">
            Follow the contact import guide
          </Link>
          .
        </p>
        <h3>What happens if I cancel?</h3>
        <p>
          Cancellation stops future billing. Access and retention depend on your
          account state and billing period.{" "}
          <Link href="/help/cancel-your-plan">
            Review cancellation and export guidance
          </Link>
          .
        </p>
        <h3>Do I need my own IDX account?</h3>
        <p>
          Yes. IDX listings are Private Preview and require your own IDX Broker
          account and approved MLS access.{" "}
          <Link href="/help/idx-broker-connect">
            Read the IDX connection guide
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AGENTSTACK_METHOD_NAME, CUSTOM_BRAND } from "@/config/landing";
import { PlaybookCaptureForm } from "@/components/landing-custom/playbook-capture-form";

export const metadata: Metadata = {
  title: `${AGENTSTACK_METHOD_NAME} | ${CUSTOM_BRAND.name}`,
  description:
    "A lower-commitment way to stay in the loop: request the AgentStack Method playbook and get the setup guidance before you open a workspace.",
};

export default function PlaybookPage() {
  return (
    <div className="min-h-screen bg-[#FFF8EF] text-[#173B7A]">
      <div className="mx-auto max-w-6xl px-4 pt-12">
        <Link
          href="/"
          className="text-sm text-[#526078] transition-colors hover:text-[#173B7A]"
        >
          &larr; Back to home
        </Link>
      </div>
      <PlaybookCaptureForm />
    </div>
  );
}

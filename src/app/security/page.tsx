import type { Metadata } from "next";
import Link from "next/link";
import { CUSTOM_BRAND } from "@/config/landing";

export const metadata: Metadata = {
  title: `${CUSTOM_BRAND.name} Security`,
  description: `How ${CUSTOM_BRAND.name} handles data ownership, access, storage, and export.`,
};

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        &larr; Back to home
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <h1>Security</h1>
        <p className="text-sm text-muted-foreground">How we protect your workspace and your data.</p>

        <p>
          All data in {CUSTOM_BRAND.name} is owner-scoped — only you and the people
          you invite can access your workspace. We use enterprise-grade
          infrastructure and encrypt stored data at rest.
        </p>

        <h2>Data ownership</h2>
        <p>
          Your contacts, deals, notes, forms, and activity stay yours. We do
          not sell or share your customer data.
        </p>

        <h2>Access controls</h2>
        <p>
          Workspace access is limited to the account owner and any teammates
          you explicitly invite. Team access follows the permissions and roles
          you set inside the product.
        </p>

        <h2>Encryption &amp; storage</h2>
        <p>
          We store application data on managed cloud infrastructure and protect
          it with encryption at rest. We also rely on established providers for
          services like hosting, payments, messaging, and email delivery.
        </p>

        <h2>Exportability</h2>
        <p>
          You can export your account data as CSV, including contacts and deal
          data, whenever you need it. We want you to be able to take your data
          with you.
        </p>

        <h2>Questions</h2>
        <p>
          If you need security details that aren&apos;t covered here, email{" "}
          <a href={`mailto:${CUSTOM_BRAND.supportEmail}`}>{CUSTOM_BRAND.supportEmail}</a>.
        </p>
      </article>
    </div>
  );
}

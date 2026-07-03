"use client";

import Link from "next/link";
import { openCrispChat } from "@/lib/crisp";
import { CUSTOM_BRAND } from "@/config/landing";

export default function PrivacyPage() {
  const brand = CUSTOM_BRAND.name;
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        &larr; Back to home
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <h1>Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: July 3, 2026</p>

        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm not-prose">
          <strong>Template — review before use.</strong> This is a starting-point
          Privacy Policy and is <em>not legal advice</em>. Have a qualified
          attorney adapt it to your company, jurisdiction, and actual data
          practices before you rely on it.
        </div>

        <h2>1. Scope</h2>
        <p>
          This Privacy Policy describes how {brand} (&ldquo;we,&rdquo;
          &ldquo;us&rdquo;), operated by [Company Legal Name], handles
          information collected through our website and the {brand} hosted
          service. {brand} is a cloud-hosted subscription service; we process
          data on your behalf to provide it, as described below.
        </p>

        <h2>2. Information We Collect</h2>
        <p>
          When you create an account, subscribe, or contact us, we collect the
          information you provide directly: name, email address, and payment
          details handled by our payment processor. When you use the Service, we
          collect account and usage data needed to operate it. When you visit
          our website, we may collect basic technical information such as IP
          address, browser type, and pages viewed.
        </p>

        <h2>3. How We Use Information</h2>
        <p>
          We use the information we collect to provide and operate the Service,
          process your subscription, send service and account communications,
          provide support, and improve the product. We do not sell or rent your
          personal information.
        </p>

        <h2>4. Third-Party Processors</h2>
        <p>
          We use third-party services (for example, payments, email, SMS/
          telephony, AI, database, and hosting) to operate the Service. These
          providers receive only the information necessary to perform their
          function and are bound by their own privacy and security terms.
        </p>

        <h2>5. Customer Data You Collect Through the Service</h2>
        <p>
          For the contacts and leads your business manages in {brand}, you are
          the data controller and we are your processor: we store and process
          that data to provide the Service and act on your documented
          instructions. You are responsible for having a lawful basis and any
          required consent to collect and contact those individuals.
        </p>

        <h2>6. Data Retention</h2>
        <p>
          We retain purchase records and contact information for as long as
          necessary to provide support, comply with legal obligations, and
          resolve disputes.
        </p>

        <h2>7. Your Rights</h2>
        <p>
          Depending on your jurisdiction, you may have the right to access,
          correct, or delete the personal information we hold about you.
          Contact us to exercise these rights.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will post
          the updated policy on this page with a new &ldquo;Last
          updated&rdquo; date.
        </p>

        <h2>9. Contact</h2>
        <p>
          For questions about this Privacy Policy,{" "}
          <button
            type="button"
            onClick={openCrispChat}
            className="underline-offset-4 hover:underline"
          >
            contact support via Chat
          </button>
          .
        </p>
      </article>
    </div>
  );
}

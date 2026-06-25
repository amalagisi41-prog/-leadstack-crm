"use client";

import Link from "next/link";
import { openCrispChat } from "@/lib/crisp";

export default function PrivacyPage() {
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
        <p className="text-sm text-muted-foreground">
          Last updated: May 10, 2026
        </p>

        <h2>1. Scope</h2>
        <p>
          This Privacy Policy describes how we handle information collected
          through our marketing website and the LeadStack purchase flow.
          LeadStack itself is self-hosted software you deploy on your own
          infrastructure — once you deploy it, your customers&rsquo; data is
          held by you, not by us.
        </p>

        <h2>2. Information We Collect</h2>
        <p>
          When you purchase or contact us, we collect the information you
          provide directly: name, email address, and payment details handled
          by our payment processor. When you visit our website, we may
          collect basic technical information such as IP address, browser
          type, and pages viewed.
        </p>

        <h2>3. How We Use Information</h2>
        <p>
          We use the information we collect to fulfill your purchase, send
          purchase-related communications, provide support, and improve our
          website. We do not sell or rent your personal information.
        </p>

        <h2>4. Third-Party Processors</h2>
        <p>
          We use third-party services to process payments, deliver email,
          and host this website. These providers receive only the
          information necessary to perform their function and are bound by
          their own privacy terms.
        </p>

        <h2>5. Customer Data Inside Your LeadStack Deployment</h2>
        <p>
          The customer data your end-users enter into your LeadStack
          deployment lives entirely within the database and provider
          accounts you control. We have no access to that data and no
          ability to retrieve, modify, or delete it. You are the data
          controller for everything your deployment captures.
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

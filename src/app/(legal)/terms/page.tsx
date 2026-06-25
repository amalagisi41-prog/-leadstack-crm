"use client";

import Link from "next/link";
import { openCrispChat } from "@/lib/crisp";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-primary"
      >
        &larr; Back to home
      </Link>

      <article className="prose dark:prose-invert mt-8 max-w-none">
        <h1>Terms of Service</h1>
        <p className="text-sm text-muted-foreground">
          Last updated: June 24, 2026
        </p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By purchasing, downloading, or using LeadStack (&ldquo;the
          Service&rdquo;), you agree to be bound by these Terms of Service. If
          you do not agree, do not purchase or use the Service.
        </p>

        <h2>2. The Service</h2>
        <p>
          LeadStack is a self-hosted, one-time-purchase software codebase. You
          buy a license, receive access to the source code, and run it on
          infrastructure you control. We do not host your deployment, store
          your customer data, or provide a SaaS layer on top of the codebase.
        </p>

        <h2>3. Purchase, Payment &amp; No Refunds</h2>
        <p>
          LeadStack is sold as a one-time purchase. There is no subscription
          and no recurring fee charged by us.
        </p>
        <p>
          <strong>All sales are final. No refunds.</strong> Because the
          Service consists of source code delivered electronically, once
          access has been granted, the purchase cannot be reversed,
          partially refunded, or exchanged. Please review the public landing
          page, FAQ, and any pre-sale materials carefully before purchasing.
        </p>

        <h2>4. Chargebacks &amp; Payment Disputes</h2>
        <p>
          If you have any concern about a charge, a billing issue, or the
          Service itself, you agree to{" "}
          <strong>
            contact our support and make a good-faith effort to resolve the
            matter first
          </strong>
          , before initiating any chargeback, payment dispute, or reversal with
          your bank or card issuer. Most issues can be resolved quickly through
          support.
        </p>
        <p>
          Because the Service is source code delivered electronically and all
          sales are final (Section 3), filing a chargeback, dispute, or payment
          reversal without first contacting support to attempt a resolution is a
          breach of these Terms.
        </p>
        <p>
          If a chargeback, payment dispute, or reversal is filed against us, we
          reserve the right to{" "}
          <strong>
            immediately and permanently revoke your license, your access to
            support, and your access to all current and future updates
          </strong>
          , and to remove you from any associated source repositories, teams, or
          related services. These remedies are in addition to, and without
          prejudice to, any other remedies available to us, including recovering
          the disputed amount together with any associated fees and costs.
        </p>

        <h2>5. License &amp; Intellectual Property</h2>
        <p>
          The LeadStack codebase is licensed under the{" "}
          <a
            href="https://polyformproject.org/licenses/perimeter/1.0.0"
            target="_blank"
            rel="noopener noreferrer"
          >
            PolyForm Perimeter License 1.0.0
          </a>
          . The full license text ships as <code>LICENSE.md</code> in the
          root of your repository.
        </p>
        <p>
          In plain English: you may use, modify, and deploy the code for any
          purpose, including running it for your own business and your
          clients, with no time limit and no recurring fee. The one
          restriction is that you may not offer the codebase &mdash; modified
          or unmodified &mdash; as a product that competes with LeadStack.
        </p>
        <p>
          You retain ownership of any modifications you make and any
          customer data you collect through your deployment.
        </p>

        <h2>6. Future Updates</h2>
        <p>
          Updates, improvements, bug fixes, and new features we release for the
          LeadStack codebase are included with your one-time purchase at no
          additional cost, and are made available to you through the same
          delivery channel as your original purchase (for example, the source
          repository) for as long as we continue to maintain and distribute
          them.
        </p>
        <p>
          Updates are provided on an <strong>optional, self-service basis</strong>.
          Because LeadStack is self-hosted and you control your own deployment
          and any modifications you have made, it is{" "}
          <strong>
            your responsibility to review, merge, test, and deploy any update
            into your codebase
          </strong>{" "}
          if you choose to adopt it. We do not perform updates on your behalf,
          and we are not responsible for any conflicts, regressions, downtime,
          or data loss that may result from applying, or from choosing not to
          apply, an update. You are under no obligation to adopt any update, and
          you may continue to run an earlier version.
        </p>
        <p>
          We make no guarantee as to the frequency, scope, timing, or continued
          availability of future updates, and nothing in this section obligates
          us to develop or release any particular feature, fix, or update.
        </p>

        <h2>7. Your Responsibilities</h2>
        <p>
          You are solely responsible for hosting, deploying, configuring,
          securing, and operating the Service. The Service is designed to
          connect to third-party providers that you supply &mdash; these
          include, but are not limited to, services for authentication and
          database, payments, email, SMS and telephony, background job
          processing, AI, website building, mapping, voice calling, analytics
          and tracking, and live chat. You are responsible for creating and
          maintaining your own accounts with these providers, configuring
          them, and paying their fees directly.
        </p>
        <p>
          Each third-party provider is governed by its own terms, pricing, and
          availability, over which we have no control. We are not responsible
          for any third-party service&rsquo;s cost, performance, downtime,
          suspension, or discontinuation, and the Service may have reduced
          functionality if a given provider is not connected.
        </p>
        <p>
          You are responsible for complying with all laws applicable to your
          use, including data-protection, electronic-communications, and
          consumer-protection laws in the jurisdictions where you and your
          customers are located.
        </p>

        <h2>8. Disclaimer of Warranties</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; without warranty of any kind, express or implied,
          including merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that the Service will be
          uninterrupted, error-free, or fit for your particular use case.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, we shall not be liable for
          any indirect, incidental, special, consequential, or punitive
          damages, or for any loss of profits, revenue, data, or goodwill,
          arising out of or related to your purchase or use of the Service.
          Our total aggregate liability for any claim shall not exceed the
          amount you paid for the Service.
        </p>

        <h2>10. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. We will post the
          updated Terms on this page with a new &ldquo;Last updated&rdquo;
          date. Your continued use of the Service after changes constitutes
          acceptance of the revised Terms.
        </p>

        <h2>11. Contact</h2>
        <p>
          For questions about these Terms,{" "}
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

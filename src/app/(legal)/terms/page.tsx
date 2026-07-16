"use client";

import Link from "next/link";
import { openSupportChat } from "@/lib/support-chat";
import { CUSTOM_BRAND } from "@/config/landing";

export default function TermsPage() {
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
        <h1>Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: July 3, 2026</p>

        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm not-prose">
          <strong>Template — review before use.</strong> This is a starting-point
          Terms of Service for a SaaS product and is <em>not legal advice</em>.
          Have a qualified attorney review and adapt it (company name,
          jurisdiction, refund policy, data practices) before you rely on it.
          Replace <code>[Company Legal Name]</code> and <code>[Jurisdiction]</code>
          throughout.
        </div>

        <h2>1. Acceptance of Terms</h2>
        <p>
          {brand} (&ldquo;{brand},&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;) is
          operated by [Company Legal Name]. By creating an account or using{" "}
          {brand} (&ldquo;the Service&rdquo;), you agree to be bound by these
          Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2>2. The Service</h2>
        <p>
          {brand} is a subscription-based, cloud-hosted software service (SaaS)
          for real estate professionals. It provides lead capture, an AI
          receptionist, pipeline management, follow-up automation, scheduling,
          and related tools. We host and operate the Service; you access it over
          the internet. Features depend on your plan and on third-party
          integrations you choose to connect.
        </p>

        <h2>3. Subscriptions, Billing &amp; Cancellation</h2>
        <p>
          The Service is offered on recurring subscription plans (for example,
          monthly or annual) at the prices shown at sign-up. By subscribing you
          authorize us to charge your payment method on a recurring basis until
          you cancel. Subscriptions renew automatically at the end of each
          billing period unless cancelled beforehand.
        </p>
        <p>
          You may cancel at any time from your account settings; cancellation
          takes effect at the end of the current billing period, and you retain
          access until then. Except where required by law, fees already charged
          are non-refundable and partial periods are not prorated. Any free
          trial converts to a paid subscription at the end of the trial unless
          you cancel first.
        </p>

        <h2>4. Payment Disputes</h2>
        <p>
          If you have a concern about a charge or the Service, please{" "}
          <strong>
            contact support and make a good-faith effort to resolve it first
          </strong>{" "}
          before initiating a chargeback or payment dispute. If a dispute is
          filed against us without contacting support, we reserve the right to
          suspend or terminate your account and recover the disputed amount plus
          associated fees.
        </p>

        <h2>5. Acceptable Use &amp; Communications Compliance</h2>
        <p>
          You are responsible for your use of the Service and for the content
          and messages you send through it. You represent that you have the
          necessary consent to contact each recipient. In particular, when
          sending SMS, calls, or emails you must comply with all applicable
          laws, including the U.S. Telephone Consumer Protection Act (TCPA),
          CAN-SPAM, carrier A2P 10DLC registration requirements, and any
          state-specific rules. You are responsible for honoring opt-outs and
          maintaining records of consent. Do not use the Service for unlawful,
          deceptive, or harassing communications.
        </p>

        <h2>6. Real Estate &amp; Listing Data</h2>
        <p>
          Any MLS, IDX, or listing data you connect or display through the
          Service is subject to the rules of the applicable MLS, association, or
          data provider. You are responsible for maintaining any required feeds,
          licenses, and display compliance. {brand} does not provide MLS/IDX
          data and makes no representation about the accuracy or licensing of
          any listing data you supply.
        </p>

        <h2>7. Third-Party Integrations</h2>
        <p>
          The Service connects to third-party providers (for example, payments,
          email, SMS/telephony, AI, and mapping). Some are supplied by us as
          part of your plan; others require your own account and fees. Each is
          governed by its own terms, and we are not responsible for a
          third-party provider&rsquo;s cost, performance, downtime, or
          discontinuation. The Service may have reduced functionality if a
          provider is unavailable.
        </p>

        <h2>8. Your Data</h2>
        <p>
          You retain ownership of the customer data and content you submit to
          the Service. You grant us the limited right to process it to provide
          and improve the Service. Our handling of personal data is described in
          our{" "}
          <Link href="/privacy">Privacy Policy</Link>. You are responsible for
          complying with data-protection laws applicable to you and your
          customers.
        </p>

        <h2>9. Intellectual Property</h2>
        <p>
          The {brand} platform, software, and brand are owned by [Company Legal
          Name] and its licensors. We grant you a limited, non-exclusive,
          non-transferable right to access and use the Service during your
          subscription. You may not copy, resell, reverse-engineer, or offer the
          Service as a competing product.
        </p>

        <h2>10. Disclaimer of Warranties</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; without warranty of any kind, express or implied,
          including merchantability, fitness for a particular purpose, and
          non-infringement. We do not warrant that the Service will be
          uninterrupted, error-free, or fit for your particular use case.
        </p>

        <h2>11. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, we shall not be liable for any
          indirect, incidental, special, consequential, or punitive damages, or
          for any loss of profits, revenue, data, or goodwill, arising out of or
          related to your use of the Service. Our total aggregate liability for
          any claim shall not exceed the amount you paid us in the 12 months
          before the claim.
        </p>

        <h2>12. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. We will post the updated
          Terms on this page with a new &ldquo;Last updated&rdquo; date. Your
          continued use of the Service after changes constitutes acceptance of
          the revised Terms.
        </p>

        <h2>13. Contact</h2>
        <p>
          For questions about these Terms,{" "}
          <button
            type="button"
            onClick={openSupportChat}
            className="underline-offset-4 hover:underline"
          >
            contact support via Chat
          </button>{" "}
          or email {CUSTOM_BRAND.supportEmail}.
        </p>
      </article>
    </div>
  );
}

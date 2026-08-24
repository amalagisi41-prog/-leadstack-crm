import type { Metadata } from "next";
import { LEGAL_ENTITY } from "@/config/legal";
import { LegalDocument, LegalValue } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement governing use of AgentStack's CRM, websites, domains, communications, integrations, and AI-assisted workflows.",
};

/**
 * AgentStack's Terms of Service.
 *
 * Governing law and venue are single-sourced from config/legal.ts. The
 * Service is offered nationwide, which is precisely why one governing law is
 * named rather than deferring to each customer's state — a clause that varied
 * by customer would be unenforceable in practice.
 */
export default function TermsPage() {
  const name = (
    <LegalValue value={LEGAL_ENTITY.legalName} field="LEGAL COMPANY NAME" />
  );

  return (
    <LegalDocument title="AgentStack Terms of Service">
      <p>
        These Terms are an agreement between <strong>{name}</strong>, doing
        business as AgentStack (&ldquo;AgentStack,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us&rdquo;), and the person or organization using the Service
        (&ldquo;Customer,&rdquo; &ldquo;you&rdquo;). By creating an account,
        purchasing a subscription, or using AgentStack, you agree to these
        Terms.
      </p>

      <h2>1. Service and accounts</h2>
      <p>
        AgentStack is cloud-hosted software for real-estate businesses.
        Features may include CRM, lead capture, forms, websites, domains,
        hosting, communications, scheduling, automation, analytics, marketing,
        integrations, and AI-assisted workflows. Features vary by plan and may
        change. You must provide accurate information, protect credentials,
        maintain permissions, and accept responsibility for account activity.
      </p>

      <h2>2. Fees, renewal, and cancellation</h2>
      <p>
        Subscriptions renew automatically for the period shown at checkout
        until cancelled. You authorize recurring charges. Cancellation takes
        effect at the end of the current paid period. Except where law requires
        otherwise, fees are non-refundable and partial periods are not prorated.
        Usage, communications, domains, premium integrations, and third-party
        services may carry separately disclosed charges.
      </p>

      <h2>3. Customer responsibilities</h2>
      <p>
        You are responsible for your users, content, contacts, websites,
        advertising, listings, communications, and connected accounts. You must
        obtain required licenses, permissions, and consents and comply with
        applicable privacy, consumer-protection, intellectual-property,
        fair-housing, real-estate, advertising, TCPA, CAN-SPAM, A2P 10DLC,
        call-recording, and do-not-call requirements in every state in which
        you operate.
      </p>
      <p>
        You must not discriminate, steer, redline, express unlawful housing
        preferences, send deceptive or unsolicited communications, impersonate
        others, upload malicious code, interfere with the Service, or violate
        another person&apos;s rights.
      </p>

      <h2>4. Customer Data</h2>
      <p>
        You retain ownership of Customer Data. You grant AgentStack a limited
        right to host, copy, process, transmit, and display it as necessary to
        provide, secure, support, and improve the Service and comply with law.
        You represent that you have the rights and lawful basis needed for
        Customer Data and your instructions.
      </p>

      <h2>5. Websites, domains, hosting, and imports</h2>
      <p>
        You retain ownership of original website content and assets you
        lawfully provide. You are responsible for domain ownership and renewal,
        source-platform access, content rights, accessibility, privacy notices,
        cookie choices, listing permissions, and required disclosures.
      </p>
      <p>
        Website import results vary by platform. AgentStack does not promise a
        pixel-identical or fully functional copy of every third-party website.
        Scripts, forms, analytics, chat, IDX, pixels, and live data may be
        isolated until reviewed and reconnected. You must approve a release
        before domain cutover. AgentStack may block publishing when required
        compliance, route, integration, or quality checks fail.
      </p>

      <h2>6. MLS, IDX, and real-estate information</h2>
      <p>
        AgentStack does not grant MLS or IDX rights. You are responsible for
        every agreement, feed, attribution, refresh rule, display rule,
        brokerage disclosure, license number, and provider charge. Listing and
        market information must be independently verified.
      </p>

      <h2>7. AI-assisted features</h2>
      <p>
        AI features produce suggestions and drafts, not professional advice or
        guaranteed facts. Output may be inaccurate, incomplete, biased, or
        noncompliant. You must review and approve output before publishing,
        sending, or relying on it. Do not use AI output as the sole basis for
        housing eligibility, lending, employment, legal, valuation, or other
        consequential decisions.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        Third-party providers control their availability, pricing, data
        practices, and terms. You authorize AgentStack to exchange data with
        services you connect. AgentStack is not responsible for third-party
        downtime, changes, acts, or omissions.
      </p>

      <h2>9. Intellectual property</h2>
      <p>
        AgentStack and its licensors own the Service, software, interface,
        documentation, trademarks, and platform technology. During an active
        subscription, you receive a limited, revocable, non-exclusive,
        non-transferable right to use the Service. You may not resell,
        sublicense, scrape, reverse engineer, evade limits, or use it to build a
        competing product except where law expressly permits. Open-source
        components remain governed by their licenses.
      </p>

      <h2>10. Suspension and termination</h2>
      <p>
        We may suspend or terminate access for material breach, nonpayment,
        security risk, unlawful activity, provider requirements, or conduct
        threatening the Service or others. Where practicable, we will provide
        notice and an opportunity to cure.
      </p>

      <h2>11. Disclaimers and liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED
        &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE.&rdquo; AGENTSTACK
        DISCLAIMS IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. AGENTSTACK DOES NOT
        GUARANTEE LEAD VOLUME, TRANSACTIONS, SEARCH RANKING, DELIVERABILITY,
        REGULATORY COMPLIANCE, OR BUSINESS RESULTS.
      </p>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, AGENTSTACK WILL NOT BE LIABLE
        FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR
        PUNITIVE DAMAGES, OR LOST PROFITS, REVENUE, GOODWILL, OR DATA.
        AGENTSTACK&apos;S AGGREGATE LIABILITY WILL NOT EXCEED THE AMOUNT YOU
        PAID AGENTSTACK DURING THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO
        THE CLAIM.
      </p>

      <h2>12. Indemnification</h2>
      <p>
        To the extent permitted by law, you will defend and indemnify
        AgentStack against third-party claims arising from Customer Data, your
        websites or communications, your violation of law or these Terms, or
        your infringement of another person&apos;s rights.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws of{" "}
        <strong>
          <LegalValue
            value={LEGAL_ENTITY.governingState}
            field="GOVERNING STATE"
          />
        </strong>
        . Exclusive venue will be the state or federal courts in{" "}
        <strong>
          <LegalValue
            value={LEGAL_ENTITY.governingVenue}
            field="GOVERNING COUNTY AND STATE"
          />
        </strong>
        , unless the parties adopt a separately reviewed arbitration provision.
        The Service is offered nationwide; this clause applies regardless of
        where a Customer operates.
      </p>

      <h2>14. Changes</h2>
      <p>
        We may update these Terms and will provide notice when legally
        required.
      </p>
    </LegalDocument>
  );
}

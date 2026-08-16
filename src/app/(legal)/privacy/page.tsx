import type { Metadata } from "next";
import { LEGAL_ENTITY } from "@/config/legal";
import { LegalDocument, LegalValue } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How AgentStack collects, uses, discloses, and protects information across its CRM, website, communications, and AI-assisted services.",
};

/**
 * AgentStack's platform Privacy Policy — the SaaS's own policy, distinct from
 * the per-agent website policy a customer links from their published site.
 *
 * Company details come from config/legal.ts so the entity, address, venue, and
 * effective date are stated in exactly one place across all three documents.
 * An unset value renders as a visible gap, never a blank.
 */
export default function PrivacyPage() {
  return (
    <LegalDocument
      title="AgentStack Privacy Policy"
      intro={
        <>
          <strong>Operational draft, not legal advice.</strong> Have counsel
          confirm this matches AgentStack&apos;s actual vendors, retention,
          security, and jurisdictions before relying on it.
        </>
      }
    >
      <p>
        AgentStack is operated by{" "}
        <strong>
          <LegalValue
            value={LEGAL_ENTITY.legalName}
            field="LEGAL COMPANY NAME"
          />
        </strong>{" "}
        (&ldquo;AgentStack,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;). This policy explains how we collect, use, disclose,
        and protect information through agentstackcrm.app and AgentStack&apos;s
        CRM, website, communications, marketing, automation, analytics, domain,
        hosting, and AI-assisted services (the &ldquo;Service&rdquo;).
      </p>

      <h2>1. Roles and scope</h2>
      <p>
        For account, billing, support, security, and product-usage information,
        AgentStack generally acts as a business or controller. For contacts,
        leads, communications, website submissions, and other data a customer
        uploads or collects through the Service (&ldquo;Customer Data&rdquo;),
        the customer generally acts as controller and AgentStack acts as
        service provider or processor.
      </p>
      <p>
        Customers are responsible for their own privacy notices, lawful basis,
        and permissions for email, calls, SMS, advertising, analytics, cookies,
        recording, and real-estate activities.
      </p>

      <h2>2. Information we collect</h2>
      <p>
        We may collect account and business information; billing and
        transaction information; Customer Data; data from integrations you
        authorize; website, domain, DNS, IDX, analytics, advertising, and
        communications configuration; prompts, source material, and AI output;
        device, browser, IP, usage, diagnostic, security, and audit
        information; support communications; and cookies or similar
        technologies.
      </p>

      <h2>3. How we use information</h2>
      <p>
        We use information to provide, secure, maintain, personalize, and
        improve the Service; authenticate users; process subscriptions; provide
        support; operate requested integrations and automations; prevent abuse;
        monitor reliability; comply with law; enforce agreements; and
        communicate about accounts, security, features, and offers where
        permitted.
      </p>
      <p>
        We do not sell personal information for money. If advertising or
        analytics activity constitutes sharing, targeted advertising, or a sale
        under applicable law, we will provide required notices and choices.
      </p>

      <h2>4. AI-assisted features</h2>
      <p>
        AgentStack may send prompts, Customer Data, and relevant context to AI
        model providers to generate requested output. Customers must not submit
        information they lack authority to process. AI output may be inaccurate
        or inappropriate and must be reviewed before it is published, sent, or
        used for legal, fair-housing, lending, valuation, or other consequential
        decisions.
      </p>

      <h2>5. Disclosures</h2>
      <p>
        We may disclose information to vendors that help operate the Service;
        integrations a customer connects; parties involved in a corporate
        transaction; authorities when required by law; or others when needed to
        protect rights, safety, and security. We do not disclose one
        customer&apos;s Customer Data to another customer except at that
        customer&apos;s direction.
      </p>

      <h2>6. Retention and security</h2>
      <p>
        We retain information as reasonably necessary to provide the Service,
        meet legal obligations, maintain security and audit records, resolve
        disputes, and enforce agreements. Backups may remain for a limited
        period after deletion. We use reasonable administrative, technical, and
        organizational safeguards, but no system is completely secure.
      </p>

      <h2>7. Privacy rights</h2>
      <p>
        AgentStack is available nationwide, and privacy rights differ by state.
        Depending on location, individuals may have rights to access, correct,
        delete, restrict, or obtain a copy of personal information, or opt out
        of certain processing. Send requests to{" "}
        <strong>
          <a href={`mailto:${LEGAL_ENTITY.contactEmail}`}>
            {LEGAL_ENTITY.contactEmail}
          </a>
        </strong>
        . We may verify identity and may direct Customer Data requests to the
        customer that controls the data. A denied request may be appealed by
        replying with &ldquo;Privacy Appeal.&rdquo;
      </p>

      <h2>8. Communications</h2>
      <p>
        Marketing email recipients may unsubscribe using the message link.
        Transactional and security messages may continue. For SMS, reply STOP
        to opt out and HELP for help. Message and data rates may apply.
        Customers using AgentStack communication tools are responsible for
        honoring opt-outs and maintaining sufficient consent records.
      </p>

      <h2>9. Children and international processing</h2>
      <p>
        The Service is for business users and is not directed to children under
        13. Information may be processed in the United States and other
        countries where AgentStack or its providers operate, using an approved
        transfer mechanism where required.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update this policy and will post the revised version with a new
        effective date.
      </p>
    </LegalDocument>
  );
}

import type { Metadata } from "next";
import { LEGAL_ENTITY } from "@/config/legal";
import { LegalDocument, LegalValue } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Software Licensing",
  description:
    "AgentStack's product license, customer website ownership, AI output rights, open-source notices, and component provenance policy.",
};

/**
 * Software licensing and open-source notice.
 *
 * Records what AgentStack owns, what the customer owns, and which
 * third-party licenses apply — including Puck (MIT), which sits in the
 * Website Studio publishing path. The release-artifact section is written as
 * outstanding gates rather than claims, because an SBOM and consolidated
 * notice have not been generated yet and stating otherwise would be the kind
 * of unverified assertion this document exists to prevent.
 */
export default function LicensingPage() {
  const name = (
    <LegalValue value={LEGAL_ENTITY.legalName} field="LEGAL COMPANY NAME" />
  );

  return (
    <LegalDocument
      title="AgentStack Software Licensing"
      intro={
        <>
          <strong>Engineering and legal draft.</strong> Generate a complete
          SBOM and license inventory from the production lockfile before
          publishing a final notice.
        </>
      }
    >
      <h2>Product license</h2>
      <p>
        AgentStack is proprietary subscription software owned and operated by{" "}
        <strong>{name}</strong>. Accessing or purchasing AgentStack does not
        transfer ownership of its software, source code, trademarks, designs,
        documentation, or platform technology. Customers receive only the
        limited right to access and use the hosted Service under the AgentStack
        Terms of Service.
      </p>

      <h2>Customer website ownership</h2>
      <p>
        Customers retain ownership of original website content and assets they
        lawfully provide. AgentStack retains ownership of its platform, editor,
        schemas, reusable software components, templates, deployment systems,
        and underlying technology. Rights in third-party fonts, images, listing
        data, integrations, and software remain subject to their respective
        licenses and terms.
      </p>

      <h2>Website imports</h2>
      <p>
        Customers may import or reproduce only content, code, media, fonts, and
        materials they own or are authorized to use. AgentStack may isolate or
        reject third-party scripts, tracking, forms, chat, IDX, analytics, or
        assets until ownership, security, licensing, privacy, and functional
        requirements are reviewed. Website migration does not transfer
        third-party licenses or provider accounts.
      </p>

      <h2>AI-assisted output</h2>
      <p>
        Subject to provider terms and law, AgentStack does not claim ownership
        of customer prompts, source content, or customer-specific output merely
        because an AI-assisted feature processed it. Customers must review
        output and confirm they have the rights required for publication and
        use. AgentStack does not guarantee generated output is unique,
        accurate, non-infringing, or eligible for intellectual-property
        protection.
      </p>

      <h2>Puck editor notice</h2>
      <p>
        AgentStack Website Studio uses <code>@puckeditor/core</code>, an
        open-source visual editor distributed under the MIT License. Puck
        operates as an editing interface over AgentStack-owned schemas and
        renderers; it is not the public website source of truth and does not
        receive ownership of customer content.
      </p>
      <p>
        Puck copyright and license information:{" "}
        <a
          href="https://github.com/puckeditor/puck"
          target="_blank"
          rel="noopener noreferrer"
        >
          github.com/puckeditor/puck
        </a>
      </p>

      <h2>Component intake policy</h2>
      <p>
        No third-party design component may enter AgentStack&apos;s production
        registry without a provenance record containing its source, author,
        license, version or commit, dependencies, included assets and fonts,
        permitted use, accessibility result, security review, reviewer, and
        approval date. Discovery catalogs such as 21st.dev are references only.
        Generated or copied code undergoes the same review.
      </p>

      <h2>Required release artifacts</h2>
      <ul>
        <li>Production SBOM covering direct and transitive packages.</li>
        <li>
          License report generated from the locked production dependency graph.
        </li>
        <li>Preserved copyright and license notices where required.</li>
        <li>
          Review of copyleft, source-available, font, icon, image, map, and
          dataset terms.
        </li>
        <li>
          Vendor register for hosting, database, payments, communications,
          email, AI, analytics, maps, and support.
        </li>
        <li>
          Current data-processing terms for every processor handling Customer
          Data.
        </li>
        <li>
          Approval record for every Website Studio production component.
        </li>
      </ul>

      <h2>Current Website Studio record</h2>
      <ul>
        <li>
          <code>@puckeditor/core</code> version 0.23.0 is pinned and identified
          upstream as MIT-licensed.
        </li>
        <li>
          AgentStack owns its site model, renderer, publishing workflow, and
          rollback system.
        </li>
        <li>
          Vercel v0 is not a required production runtime or publishing control
          plane.
        </li>
        <li>
          21st.dev is a discovery source, not an unrestricted production
          dependency.
        </li>
        <li>
          A formal SBOM, consolidated notice, vulnerability review, and
          component provenance remain release gates.
        </li>
      </ul>
    </LegalDocument>
  );
}

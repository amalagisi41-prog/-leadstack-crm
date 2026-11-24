import { HOMEPAGE_DESCRIPTION, SITE_URL } from "./offer";
export function homepageSchema() {
  // The public price is unconfirmed. Deliberately omit offers and sameAs.
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "AgentStack CRM",
        url: SITE_URL,
        logo: `${SITE_URL}/icons/logo-light-192.png`,
      },
      {
        "@type": "SoftwareApplication",
        name: "AgentStack CRM",
        url: SITE_URL,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description: HOMEPAGE_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

import { HOMEPAGE_DESCRIPTION, SITE_URL, SOLO_PRICE } from "./offer";
export function homepageSchema() {
  // Publish the confirmed monthly offer. No official social profiles were supplied.
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
        offers: {
          "@type": "Offer",
          price: SOLO_PRICE,
          priceCurrency: "USD",
          url: `${SITE_URL}/pricing`,
          description: `AgentStack Solo — $${SOLO_PRICE}/month`,
        },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

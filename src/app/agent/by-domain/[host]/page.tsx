import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { AgentSiteRenderer } from "@/components/website-studio/agent-site-renderer";
import { getTemplate } from "@/lib/website-studio/templates";
import { normalizeHost } from "@/lib/domains/app-hosts";
import type { AgentSiteDoc } from "@/types/agent-site";

/**
 * Published agent website, resolved by CUSTOM DOMAIN.
 *
 * Middleware rewrites any request whose Host is not one of ours to
 * /agent/by-domain/{host}{path}. This route does the half that middleware
 * cannot: look the host up in Firestore. Middleware runs on the Edge runtime,
 * where the Firebase Admin SDK does not work, so the classification (is this
 * host ours?) happens there and the lookup (whose is it?) happens here.
 *
 * Before this existed, "Connect Domain" wrote `customDomain` to Firestore and
 * nothing else happened. No route read it, so an agent who pointed their DNS
 * at this deployment reached the marketing site — never their own website. The
 * final step of onboarding could not produce a working outcome.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function resolveSubAccountByHost(host: string) {
  const normalized = normalizeHost(host).replace(/^www\./, "");
  if (!normalized) return null;

  const snap = await getAdminDb()
    .collection("subAccounts")
    .where("customDomain", "==", normalized)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

export default async function PublishedSiteByDomain({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;

  const sub = await resolveSubAccountByHost(decodeURIComponent(host));
  // An unrecognised host means somebody pointed DNS here without connecting
  // the domain in AgentStack. 404 rather than leaking which workspaces exist.
  if (!sub) notFound();

  const siteSnap = await getAdminDb()
    .doc(`subAccounts/${sub.id}/agentSites/main`)
    .get();

  if (!siteSnap.exists) return <DomainConnectedButNoSite />;

  const site = siteSnap.data() as AgentSiteDoc;
  // Same rule as the /agent/[id]/[slug] route: never serve a draft. But a
  // connected domain with an unpublished site is a different situation from a
  // domain nobody claimed — the agent did the DNS work correctly and is one
  // click from live. Telling them that is the whole point.
  if (site.status !== "published") return <DomainConnectedButNoSite />;

  const idxConnected = Boolean(
    sub.data?.idxEnabledByAgency === true && sub.data?.idxConfig?.enabled,
  );

  // Same props as /agent/[subAccountId]/[slug] — this route differs only in
  // how it finds the sub-account, never in what it renders.
  return (
    <AgentSiteRenderer
      template={getTemplate(site.templateId)}
      content={site.content}
      composition={site.composition}
      idx={{
        connected: idxConnected,
        url: `/idx/${sub.id}`,
        displayName: sub.data?.idxConfig?.displayName,
      }}
      design={site.design ?? {}}
    />
  );
}

/**
 * The domain is connected and DNS is working — that is genuinely good news and
 * worth saying, because the agent has just done the hard part. What they see
 * otherwise is a bare 404 that looks identical to a broken cutover.
 */
function DomainConnectedButNoSite() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        background: "#fbfaf8",
        color: "#101a2e",
      }}
    >
      <div style={{ maxWidth: "32rem", textAlign: "center" }}>
        <p
          style={{
            fontSize: ".72rem",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#1f6f5c",
            margin: "0 0 1rem",
            fontWeight: 600,
          }}
        >
          Domain connected
        </p>
        <h1
          style={{
            fontSize: "1.6rem",
            lineHeight: 1.25,
            margin: "0 0 .9rem",
            fontWeight: 600,
          }}
        >
          Your domain is working. Your website isn&apos;t published yet.
        </h1>
        <p style={{ color: "#5a6478", lineHeight: 1.6, margin: 0 }}>
          DNS is pointing here correctly — that was the hard part. Open Website
          Studio in AgentStack and publish your site, and it will appear at this
          address straight away.
        </p>
      </div>
    </main>
  );
}

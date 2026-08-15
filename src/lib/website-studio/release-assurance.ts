import type {
  AgentSiteComposition,
  AgentSiteContent,
  AgentSiteSectionType,
} from "@/types/agent-site";
import { normalizeAgentSiteComposition } from "./site-composition";
import { assessAgentSitePublishReadiness } from "./publish-readiness";

export type ReleaseAssuranceCheck = {
  id: string;
  category:
    | "route"
    | "responsive"
    | "asset"
    | "lead-path"
    | "compliance"
    | "integration"
    | "rollback";
  label: string;
  status: "passed" | "warning" | "blocked";
  detail: string;
};

export type ReleaseAssuranceReport = {
  passed: boolean;
  checks: ReleaseAssuranceCheck[];
  routeManifest: string[];
  testedViewports: string[];
};

const REQUIRED_SECTIONS: AgentSiteSectionType[] = [
  "header",
  "hero",
  "cta",
  "footer",
];
const VIEWPORTS = ["1440×900", "1280×800", "768×1024", "390×844", "375×812"];

function secureAsset(value: string) {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function assessAgentSiteReleaseAssurance(input: {
  content: AgentSiteContent;
  composition?: AgentSiteComposition;
  slug: string;
  idxConnected: boolean;
  hasRollbackRevision: boolean;
}): ReleaseAssuranceReport {
  const checks: ReleaseAssuranceCheck[] = [];
  const add = (check: ReleaseAssuranceCheck) => checks.push(check);
  const composition = normalizeAgentSiteComposition(input.composition);
  const routeManifest = [`/agent/:subAccountId/${input.slug}`];

  add({
    id: "route-primary",
    category: "route",
    label: "Primary route",
    status: input.slug.trim() ? "passed" : "blocked",
    detail: input.slug.trim()
      ? `Resolves intentionally at ${routeManifest[0]}.`
      : "Add a valid public-site slug.",
  });

  const hiddenRequired = REQUIRED_SECTIONS.filter((type) =>
    composition.sections.some(
      (section) => section.type === type && !section.visible
    )
  );
  add({
    id: "required-sections",
    category: "responsive",
    label: "Required responsive sections",
    status: hiddenRequired.length ? "blocked" : "passed",
    detail: hiddenRequired.length
      ? `Required sections hidden: ${hiddenRequired.join(", ")}.`
      : `Shared renderer covers ${VIEWPORTS.join(", ")}.`,
  });

  const assets = [
    input.content.logoUrl,
    input.content.headshotUrl,
    input.content.heroImageUrl,
    ...input.content.galleryUrls,
    ...input.content.listings.map((listing) => listing.imageUrl),
  ];
  const invalidAssets = assets.filter((asset) => !secureAsset(asset));
  add({
    id: "secure-assets",
    category: "asset",
    label: "Secure asset manifest",
    status: invalidAssets.length ? "blocked" : "passed",
    detail: invalidAssets.length
      ? `${invalidAssets.length} asset URL(s) are invalid or not HTTPS.`
      : `${assets.filter(Boolean).length} supplied asset URL(s) use HTTPS.`,
  });

  const hasContact = Boolean(
    input.content.phone.trim() || input.content.email.trim()
  );
  add({
    id: "primary-cta",
    category: "lead-path",
    label: "Primary contact path",
    status: hasContact ? "passed" : "blocked",
    detail: hasContact
      ? "CTA has a phone or email destination."
      : "CTA has no phone or email destination.",
  });

  for (const issue of assessAgentSitePublishReadiness(input.content)) {
    add({
      id: `compliance-${issue.field}`,
      category: "compliance",
      label: issue.field,
      status: issue.severity === "blocker" ? "blocked" : "warning",
      detail: issue.message,
    });
  }

  add({
    id: "idx-inventory",
    category: "integration",
    label: "IDX inventory",
    status: input.idxConnected ? "passed" : "warning",
    detail: input.idxConnected
      ? "Tenant-scoped IDX is connected."
      : "IDX is intentionally off or still needs connection.",
  });
  add({
    id: "rollback-revision",
    category: "rollback",
    label: "Rollback target",
    status: input.hasRollbackRevision ? "passed" : "blocked",
    detail: input.hasRollbackRevision
      ? "An immutable prior revision is available."
      : "Save a revision before approving release.",
  });

  return {
    passed: !checks.some((check) => check.status === "blocked"),
    checks,
    routeManifest,
    testedViewports: [...VIEWPORTS],
  };
}

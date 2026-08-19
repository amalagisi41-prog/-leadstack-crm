import "server-only";

import { safePublicUrl } from "./read-public-page";

/**
 * Deterministic profile facts from a page's own machine-readable structure.
 *
 * Real-estate sites publish schema.org JSON-LD precisely so machines can read
 * who the agent is — `RealEstateAgent`, `Person`, `LocalBusiness` nodes with
 * name, telephone, email, address and brokerage. The import pipeline used to
 * destroy that before anything saw it: `readableText` strips every `<script>`
 * tag, and `application/ld+json` lives in one. The only deterministic
 * extraction was a Zillow-specific regex adapter, so a Crexi or brokerage page
 * that declares its facts outright still went to the model as prose and came
 * back at 29%.
 *
 * Everything returned here was literally published by the page, so it merges
 * ahead of model output. Nothing is guessed: a field is either present in the
 * structure and valid, or absent. Licence numbers are deliberately never
 * mapped — no schema.org property carries one reliably, and a wrong licence
 * number is the most expensive kind of wrong.
 */

/** JSON-LD node types that describe the page's subject, not incidental data. */
const PERSON_TYPES = new Set(["realestateagent", "person"]);
const ORG_TYPES = new Set([
  "realestateagent",
  "localbusiness",
  "organization",
  "realestateorganization",
  "corporation",
]);

/** Directory hosts whose profile URLs must never become the agent's website. */
const DIRECTORY_HOSTS = [
  "zillow.com",
  "realtor.com",
  "homes.com",
  "crexi.com",
  "trulia.com",
  "redfin.com",
  "loopnet.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
];

function isDirectoryUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return DIRECTORY_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

type JsonLdNode = Record<string, unknown>;

function nodeTypes(node: JsonLdNode): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t.toLowerCase()];
  if (Array.isArray(t))
    return t.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  return [];
}

/** Flatten a parsed JSON-LD document (including @graph and arrays) to nodes. */
function flattenNodes(value: unknown, depth = 0): JsonLdNode[] {
  if (depth > 6 || value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((v) => flattenNodes(v, depth + 1));
  const node = value as JsonLdNode;
  const children = flattenNodes(node["@graph"], depth + 1);
  return [node, ...children];
}

/**
 * Every JSON-LD block on the page, parsed tolerantly.
 *
 * One malformed block must not cost the others: pages routinely carry several
 * scripts from different widgets, and analytics vendors ship broken ones.
 */
export function parseJsonLd(html: string): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const scripts = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of scripts) {
    const body = match[1].trim();
    if (!body) continue;
    try {
      nodes.push(...flattenNodes(JSON.parse(body)));
    } catch {
      // HTML comments or CDATA wrappers around otherwise-valid JSON.
      const cleaned = body.replace(/^\s*(?:<!--|\/\/<!\[CDATA\[)|(?:-->|\/\/\]\]>)\s*$/g, "").trim();
      try {
        nodes.push(...flattenNodes(JSON.parse(cleaned)));
      } catch {
        /* this block is genuinely broken; the rest still count */
      }
    }
  }
  return nodes;
}

function firstString(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v)) {
      const s = v.find((x) => typeof x === "string" && x.trim());
      if (s) return (s as string).trim();
    }
  }
  return "";
}

/** `worksFor` / `image` etc. may be a string, a node, or an array of either. */
function nestedName(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return nestedName(value[0]);
  if (value && typeof value === "object")
    return firstString((value as JsonLdNode).name);
  return "";
}

function nestedUrl(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return nestedUrl(value[0]);
  if (value && typeof value === "object")
    return firstString((value as JsonLdNode).url, (value as JsonLdNode).contentUrl);
  return "";
}

/** Subject entities are often nested under ProfilePage.mainEntity. */
function subjectNodes(node: JsonLdNode): JsonLdNode[] {
  return node.mainEntity ? flattenNodes(node.mainEntity) : [];
}

/** "123 Main St, Stamford, CT" out of a PostalAddress node or plain string. */
function addressLocality(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return addressLocality(value[0]);
  if (value && typeof value === "object") {
    const a = value as JsonLdNode;
    const parts = [a.addressLocality, a.addressRegion]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean);
    return parts.join(", ");
  }
  return "";
}

function areaServed(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const names = value
      .map((v) =>
        typeof v === "string" ? v.trim() : nestedName(v)
      )
      .filter(Boolean);
    return names.slice(0, 8).join(", ");
  }
  if (value && typeof value === "object") return nestedName(value);
  return "";
}

// ---------------------------------------------------------------------------
// Validation — a fact from structure still has to look like the thing it claims
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export function normalizeEmail(value: string): string {
  const cleaned = value.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
  return EMAIL_RE.test(cleaned) ? cleaned : "";
}

export function normalizePhone(value: string): string {
  const cleaned = value.replace(/^tel:/i, "").trim();
  const digits = cleaned.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return "";
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

/** A usable personal name: letters, a space, no UI copy glued on. */
function plausibleName(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!/^[A-Za-z][A-Za-z .'’-]{2,79}$/.test(cleaned)) return "";
  if (!cleaned.includes(" ")) return "";
  if (/report a problem|sign in|reviews?$/i.test(cleaned)) return "";
  return cleaned;
}

function plausibleOrg(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 80) return "";
  if (/^https?:\/\//i.test(cleaned)) return "";
  if (/report a problem|cookie|privacy policy/i.test(cleaned)) return "";
  return cleaned;
}

// ---------------------------------------------------------------------------
// Contact links — works on raw HTML and on reader markdown alike
// ---------------------------------------------------------------------------

export function contactLinksFromContent(content: string): {
  phone?: string;
  email?: string;
} {
  const result: { phone?: string; email?: string } = {};
  const tel = content.match(/tel:([+\d()%. -]{7,25})/i)?.[1];
  if (tel) {
    const phone = normalizePhone(decodeURIComponent(tel));
    if (phone) result.phone = phone;
  }
  const mailto = content.match(/mailto:([^"')\s>?]+)/i)?.[1];
  if (mailto) {
    const email = normalizeEmail(decodeURIComponent(mailto));
    if (email) result.email = email;
  }
  return result;
}

// ---------------------------------------------------------------------------
// The extractor
// ---------------------------------------------------------------------------

export interface StructuredProfileInput {
  /** Raw page body — HTML from a direct fetch, markdown from a reader. */
  raw: string;
  /** Which kind `raw` is; JSON-LD only exists in HTML. */
  kind: "html" | "markdown";
  /** The source URL, so a directory's own profile link never becomes `website`. */
  url: string;
}

/**
 * Facts the page itself declares, validated and normalised. Empty object when
 * the page declares nothing usable — never a guess, never a placeholder.
 */
export function extractStructuredProfile({
  raw,
  kind,
  url,
}: StructuredProfileInput): Record<string, string> {
  const result: Record<string, string> = {};

  if (kind === "html") {
    const nodes = parseJsonLd(raw);
    const personNodes = nodes.filter((n) =>
      nodeTypes(n).some((t) => PERSON_TYPES.has(t))
    );
    const orgNodes = nodes.filter((n) =>
      nodeTypes(n).some((t) => ORG_TYPES.has(t))
    );
    // The page's subject first; org-level contact details as fallback.
    // Profile directories commonly wrap the actual Person/RealEstateAgent in
    // a ProfilePage.mainEntity instead of placing it in @graph.
    const nestedSubjects = nodes.flatMap(subjectNodes).filter((n) =>
      nodeTypes(n).some((t) => PERSON_TYPES.has(t) || ORG_TYPES.has(t))
    );
    const subjects: JsonLdNode[] = [...personNodes, ...orgNodes, ...nestedSubjects];

    for (const node of subjects) {
      const isPerson = nodeTypes(node).some((t) => PERSON_TYPES.has(t));

      if (!result.agentName && isPerson) {
        const name = plausibleName(firstString(node.name));
        if (name) result.agentName = name;
      }
      if (!result.title && isPerson) {
        const title = firstString(node.jobTitle);
        if (title && title.length <= 80) result.title = title;
      }
      if (!result.brokerage) {
        const brokerage = plausibleOrg(
          isPerson
            ? nestedName(node.worksFor) ||
                nestedName(node.subOrganization) ||
                nestedName(node.memberOf) ||
                nestedName(node.affiliation)
            : firstString(node.name)
        );
        // An org node that duplicates the agent's own name is not a brokerage.
        if (brokerage && brokerage !== result.agentName)
          result.brokerage = brokerage;
      }
      if (!result.phone) {
        const phone = normalizePhone(firstString(node.telephone));
        if (phone) result.phone = phone;
      }
      if (!result.email) {
        const email = normalizeEmail(firstString(node.email));
        if (email) result.email = email;
      }
      if (!result.website) {
        const candidate = safePublicUrl(nestedUrl(node.url));
        if (candidate && candidate !== url && !isDirectoryUrl(candidate))
          result.website = candidate;
      }
      if (!result.headshotUrl && isPerson) {
        const image = safePublicUrl(nestedUrl(node.image));
        if (image) result.headshotUrl = image;
      }
      if (!result.serviceAreas) {
        const areas = areaServed(node.areaServed) || addressLocality(node.address);
        if (areas && areas.length <= 200) result.serviceAreas = areas;
      }
      if (!result.bio) {
        const description = firstString(node.description);
        // Short descriptions are taglines and og boilerplate, not a bio.
        if (isPerson && description.length >= 80 && description.length <= 4000)
          result.bio = description;
      }
    }
  }

  // tel:/mailto: links survive in both HTML and reader markdown, and they are
  // the site owner's own declaration of how to be contacted.
  const links = contactLinksFromContent(raw);
  if (!result.phone && links.phone) result.phone = links.phone;
  if (!result.email && links.email) result.email = links.email;

  return result;
}

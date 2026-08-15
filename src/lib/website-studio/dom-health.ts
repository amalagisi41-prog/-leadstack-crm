export type HostedDomHealth = {
  passed: boolean;
  checks: Array<{ id: string; passed: boolean; detail: string }>;
  assetUrls: string[];
};

export function inspectHostedSiteHtml(html: string): HostedDomHealth {
  const assetUrls = [
    ...html.matchAll(/<(?:img|script)[^>]+src=["']([^"']+)["']/gi),
    ...html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi),
  ].map((match) => match[1]);
  const checks = [
    {
      id: "document",
      passed: /<!doctype html>/i.test(html) && /<html[\s>]/i.test(html),
      detail: "Complete HTML document returned.",
    },
    {
      id: "renderer-root",
      passed: /class=["'][^"']*agent-site-root/.test(html),
      detail: "Shared AgentStack renderer root is present.",
    },
    {
      id: "responsive-css",
      passed: /@media\s*\(max-width:\s*720px\)/.test(html),
      detail: "Required mobile renderer rules are present.",
    },
    {
      id: "legal-nav",
      passed: /aria-label=["']Legal["']/.test(html),
      detail: "Legal navigation is rendered.",
    },
    {
      id: "empty-assets",
      passed: !assetUrls.some((url) => !url.trim()),
      detail: `${assetUrls.length} asset reference(s) discovered.`,
    },
  ];
  return {
    passed: checks.every((check) => check.passed),
    checks,
    assetUrls: [...new Set(assetUrls)],
  };
}

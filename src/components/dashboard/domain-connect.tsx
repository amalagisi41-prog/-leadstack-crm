"use client";

import { useState } from "react";
import {
  Globe,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Guided domain setup — the final onboarding step. The operator either
 * connects a domain they already own (we show the exact DNS records) or gets
 * pointed to a registrar to buy a new one. The chosen domain is saved on the
 * sub-account; the actual DNS + Vercel hookup is a documented ops step.
 */

const DNS_RECORDS = [
  {
    type: "A",
    name: "@",
    value: "76.76.21.21",
    note: "Root domain (example.com)",
  },
  {
    type: "CNAME",
    name: "www",
    value: "cname.vercel-dns.com",
    note: "www subdomain",
  },
];

const REGISTRARS = [
  {
    name: "Namecheap",
    url: "https://www.namecheap.com/domains/",
    note: "Low cost, easy DNS",
  },
  {
    name: "Cloudflare",
    url: "https://dash.cloudflare.com/",
    note: "At-cost pricing, fast DNS",
  },
  {
    name: "GoDaddy",
    url: "https://www.godaddy.com/domains",
    note: "Most popular",
  },
  {
    name: "Squarespace Domains",
    url: "https://domains.squarespace.com/",
    note: "Formerly Google Domains",
  },
];

const PROVIDER_PORTALS = [
  {
    name: "HighLevel Domains",
    url: "https://app.gohighlevel.com/",
    note: "Open Settings → Domains if GHL manages it",
  },
  {
    name: "GoDaddy Domains",
    url: "https://dcc.godaddy.com/domains",
    note: "Open DNS and transfer settings",
  },
  {
    name: "Bluehost Portal",
    url: "https://my.bluehost.com/hosting/app",
    note: "Open hosting and WordPress tools",
  },
  {
    name: "WordPress.com",
    url: "https://wordpress.com/me/purchases",
    note: "Open domains, hosting, and exports",
  },
  {
    name: "Cloudflare",
    url: "https://dash.cloudflare.com/",
    note: "Open DNS management",
  },
  {
    name: "Vercel",
    url: "https://vercel.com/dashboard",
    note: "Open managed deployment hosting",
  },
];

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-background flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5">
      <div className="min-w-0">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          {label}
        </span>
        <div className="truncate font-mono text-xs">{value}</div>
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-muted-foreground hover:text-foreground shrink-0"
        aria-label={`Copy ${label}`}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

export function DomainConnect() {
  const { subAccountId, subAccount } = useSubAccount();
  const [tab, setTab] = useState<"existing" | "unknown" | "new">("existing");
  const [domain, setDomain] = useState(subAccount?.customDomain ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(
    subAccount?.customDomain ?? null
  );

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/domain`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        domain?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setSaved(data.domain ?? null);
      toast.success(data.domain ? `Saved ${data.domain}.` : "Domain cleared.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card rounded-2xl border p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
          <Globe className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold tracking-tight">Connect your domain</h2>
          <p className="text-muted-foreground text-xs">
            Put your website on your own web address — the final setup step.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-lg border p-1">
        <button
          onClick={() => setTab("unknown")}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${tab === "unknown" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"}`}
        >
          I&apos;m not sure
        </button>
        <button
          onClick={() => setTab("existing")}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${tab === "existing" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"}`}
        >
          I have a domain
        </button>
        <button
          onClick={() => setTab("new")}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${tab === "new" ? "bg-[#1a2f50] text-white" : "text-muted-foreground hover:text-foreground"}`}
        >
          I need a domain
        </button>
      </div>

      {tab === "existing" ? (
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Your domain</label>
            <div className="flex gap-2">
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="janedoe-homes.com"
                className="h-9"
              />
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </div>
            {saved && (
              <p className="flex items-center gap-1 text-[11px] text-emerald-600">
                <Check className="h-3 w-3" /> Saved — now add the DNS records
                below at your registrar.
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium">
              Add these records in your registrar&apos;s DNS settings:
            </p>
            <div className="space-y-2">
              {DNS_RECORDS.map((r) => (
                <div key={r.type + r.name} className="rounded-lg border p-2.5">
                  <p className="text-muted-foreground mb-1.5 text-[11px]">
                    {r.note}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <CopyRow label="Type" value={r.type} />
                    <CopyRow label="Name" value={r.name} />
                    <CopyRow label="Value" value={r.value} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground mt-2 text-[11px]">
              DNS changes can take a few minutes to a few hours to take effect.
              Once they propagate, your site will resolve at your domain. Your
              agency adds the domain in the hosting dashboard to issue the SSL
              certificate.
            </p>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium">
              Open the account where your domain or website currently lives:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PROVIDER_PORTALS.map((provider) => (
                <a
                  key={provider.name}
                  href={provider.url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-background flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:border-blue-300"
                >
                  <div>
                    <div className="font-medium">{provider.name}</div>
                    <div className="text-muted-foreground text-[11px]">
                      {provider.note}
                    </div>
                  </div>
                  <ExternalLink className="text-muted-foreground h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      ) : tab === "unknown" ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-[#173B7A]">
            <p className="flex items-center gap-2 font-semibold">
              <Search className="h-4 w-4" /> Zack can help you find it
            </p>
            <p className="mt-1 text-xs leading-5 text-[#526078]">
              Start with the website address clients already use. You do not
              need to remember the registrar or hosting company. Never share a
              password with AgentStack.
            </p>
          </div>
          <ol className="space-y-3 text-sm">
            <li className="rounded-xl border p-4">
              <p className="font-semibold">1. Check HighLevel first</p>
              <p className="text-muted-foreground mt-1 text-xs">
                In your GHL location, open Settings → Domains. A domain
                purchased or connected through GHL normally appears there.
              </p>
              <a
                href="https://app.gohighlevel.com/"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
              >
                Open HighLevel <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li className="rounded-xl border p-4">
              <p className="font-semibold">
                2. Look up the registered provider
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                ICANN Lookup can identify the registrar from the website address
                even when you cannot remember where it was purchased.
              </p>
              <a
                href="https://lookup.icann.org/"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
              >
                Open ICANN Lookup <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li className="rounded-xl border p-4">
              <p className="font-semibold">
                3. Recover access, then return here
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Use the provider&apos;s password recovery with the email that
                receives domain renewal receipts. Search that inbox for “domain
                renewal,” “registrar,” or the domain name.
              </p>
            </li>
          </ol>
          <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Keep the current DNS unchanged until the AgentStack replacement has
            been reviewed and approved. This keeps the existing website and
            email online.
          </div>
          <Button variant="outline" onClick={() => setTab("existing")}>
            I found my provider
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-muted-foreground text-sm">
            Don&apos;t have a domain yet? Register one at any of these — a .com
            for your name or market (e.g.{" "}
            <span className="font-medium">janedoe-homes.com</span>) usually runs
            $10–15/year. Then come back and connect it under &ldquo;I have a
            domain.&rdquo;
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {REGISTRARS.map((r) => (
              <a
                key={r.name}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="bg-background flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:border-blue-300"
              >
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-muted-foreground text-[11px]">
                    {r.note}
                  </div>
                </div>
                <ExternalLink className="text-muted-foreground h-3.5 w-3.5" />
              </a>
            ))}
          </div>
          <p className="text-muted-foreground text-[11px]">
            Tip: pick something short, easy to say on a call, and close to your
            name or farm area. Avoid hyphens and numbers where you can.
          </p>
        </div>
      )}
    </div>
  );
}

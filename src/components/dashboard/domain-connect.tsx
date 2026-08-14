"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Eye,
  Globe,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Rocket,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openAskAssistant } from "@/components/dashboard/ask-assistant-panel";
import type { WebsiteTransferDoc } from "@/types/website-transfer";

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
    key: "highlevel",
    name: "HighLevel Domains",
    url: "https://app.gohighlevel.com/",
    note: "Open Settings → Domains if GHL manages it",
    steps: [
      "Choose the correct business location.",
      "Open Settings in the lower-left sidebar.",
      "Open Domains and find the website address.",
      "Leave every record unchanged and return to AgentStack.",
    ],
  },
  {
    key: "godaddy",
    name: "GoDaddy Domains",
    url: "https://dcc.godaddy.com/domains",
    note: "Open DNS and transfer settings",
    steps: [
      "Find the domain in My Products → Domains.",
      "Open Manage DNS, but do not edit a record yet.",
      "Confirm the domain is active and return to AgentStack.",
    ],
  },
  {
    key: "bluehost",
    name: "Bluehost Portal",
    url: "https://my.bluehost.com/hosting/app",
    note: "Open hosting and WordPress tools",
    steps: [
      "Open Websites and locate the current real-estate site.",
      "Note the connected domain and whether the site uses WordPress.",
      "Do not start a transfer or cancel the plan; return to AgentStack.",
    ],
  },
  {
    key: "wordpress",
    name: "WordPress.com",
    url: "https://wordpress.com/me/purchases",
    note: "Open domains, hosting, and exports",
    steps: [
      "Open Purchases or Sites and locate the current website.",
      "Confirm its public domain and active plan.",
      "Leave the live site unchanged and return to AgentStack.",
    ],
  },
  {
    key: "cloudflare",
    name: "Cloudflare",
    url: "https://dash.cloudflare.com/?to=/:account/domains",
    note: "Find the domain; do not edit DNS yet",
    steps: [
      "In the left sidebar, open Domains → Overview.",
      "Select the domain used by the current website.",
      "Confirm its status is Active. Do not open Transfers and do not change nameservers.",
      "Return to AgentStack and confirm that you found it.",
    ],
  },
] as const;

type ProviderKey = (typeof PROVIDER_PORTALS)[number]["key"];

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

function CutoverStatus({
  label,
  value,
  complete,
}: {
  label: string;
  value: string;
  complete: boolean;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
        {complete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <Loader2 className="h-4 w-4 text-amber-600" />
        )}
        {value}
      </p>
    </div>
  );
}

export function DomainConnect() {
  const { subAccountId, subAccount, saPath } = useSubAccount();
  const searchParams = useSearchParams();
  const isCutover = searchParams.get("stage") === "cutover";
  const [tab, setTab] = useState<"existing" | "unknown" | "new">("existing");
  const [domain, setDomain] = useState(subAccount?.customDomain ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(
    subAccount?.customDomain ?? null
  );
  const [providerKey, setProviderKey] = useState<ProviderKey | null>(null);
  const [providerConfirmed, setProviderConfirmed] = useState(false);
  const [providerOutcome, setProviderOutcome] = useState<
    "found" | "empty" | null
  >(null);
  const [replacementApproved, setReplacementApproved] = useState(false);
  const [privatePreviewPath, setPrivatePreviewPath] = useState<string | null>(
    null
  );
  const [detectedDnsProvider, setDetectedDnsProvider] = useState<string | null>(
    null
  );
  const [hostingStatus, setHostingStatus] = useState<
    "not_requested" | "requested" | "ready"
  >("not_requested");
  const [hostingUrl, setHostingUrl] = useState<string | null>(null);
  const [requestingHosting, setRequestingHosting] = useState(false);

  useEffect(() => {
    fetch(`/api/sub-accounts/${subAccountId}/website-transfer`)
      .then((response) => response.json())
      .then(
        (data: {
          transfer?: {
            status?: string;
            privatePreviewPath?: string;
            inventory?: { dnsProvider?: string | null };
            hostingStatus?: "not_requested" | "requested" | "ready";
            hostingUrl?: string | null;
          } | null;
        }) => {
          setReplacementApproved(data.transfer?.status === "approved");
          setPrivatePreviewPath(data.transfer?.privatePreviewPath ?? null);
          setHostingStatus(data.transfer?.hostingStatus ?? "not_requested");
          setHostingUrl(data.transfer?.hostingUrl ?? null);
          const dnsProvider = data.transfer?.inventory?.dnsProvider ?? null;
          setDetectedDnsProvider(dnsProvider);
          if (isCutover && dnsProvider?.toLowerCase() === "cloudflare") {
            setProviderKey("cloudflare");
            setProviderConfirmed(true);
            setProviderOutcome("found");
          }
        }
      )
      .catch(() => {
        setReplacementApproved(false);
        setPrivatePreviewPath(null);
      });
  }, [isCutover, subAccountId]);

  const hostingTargetReady = Boolean(
    hostingStatus === "ready" && hostingUrl?.startsWith("https://")
  );

  async function requestManagedHosting() {
    setRequestingHosting(true);
    try {
      const response = await fetch(
        `/api/sub-accounts/${subAccountId}/website-transfer`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request_hosting" }),
        }
      );
      const data = (await response.json().catch(() => ({}))) as {
        transfer?: WebsiteTransferDoc;
        error?: string;
      };
      if (!response.ok || !data.transfer)
        throw new Error(data.error ?? "Hosting setup could not be requested.");
      setHostingStatus(data.transfer.hostingStatus ?? "requested");
      setHostingUrl(data.transfer.hostingUrl ?? null);
      toast.success("Managed hosting setup requested.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Hosting setup could not be requested."
      );
    } finally {
      setRequestingHosting(false);
    }
  }

  const selectedProvider = PROVIDER_PORTALS.find(
    (provider) => provider.key === providerKey
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

  if (isCutover) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-2xl border-2 border-blue-300 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-blue-700 uppercase">
                Final step — hosting and DNS
              </p>
              <h1 className="mt-2 text-2xl font-bold">
                {hostingStatus === "requested"
                  ? "AgentStack is preparing your hosted site"
                  : hostingTargetReady
                    ? "Your hosting target is ready"
                    : "One action remains: request managed hosting"}
              </h1>
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
                {hostingStatus === "requested"
                  ? "Your request is saved. Keep the current website and Cloudflare settings unchanged. AgentStack must create and verify the standalone URL and SSL before DNS instructions unlock."
                  : hostingTargetReady
                    ? "AgentStack verified the hosted replacement. Continue with the provider-specific DNS checklist below."
                    : "AgentStack needs to create a standalone hosted destination for the approved replacement. You do not need to open Vercel, transfer the domain, or change Cloudflare yet."}
              </p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
              Step 5 of 5
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <CutoverStatus
              label="Replacement"
              value={replacementApproved ? "Approved" : "Approval required"}
              complete={replacementApproved}
            />
            <CutoverStatus
              label="Managed hosting"
              value={
                hostingTargetReady
                  ? "Verified"
                  : hostingStatus === "requested"
                    ? "Setup requested"
                    : "Action required"
              }
              complete={hostingTargetReady}
            />
            <CutoverStatus
              label="DNS provider"
              value={detectedDnsProvider ?? "Cloudflare"}
              complete={Boolean(detectedDnsProvider)}
            />
          </div>

          {!hostingTargetReady ? (
            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <p className="text-sm font-semibold">Do not change DNS yet</p>
              <p className="mt-1 text-xs leading-5">
                The existing site and email remain live. DNS records will appear
                here only after AgentStack verifies the dedicated hosting
                destination.
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            {hostingStatus === "not_requested" ? (
              <Button
                type="button"
                onClick={requestManagedHosting}
                disabled={requestingHosting || !replacementApproved}
              >
                {requestingHosting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Server className="mr-2 h-4 w-4" />
                )}
                Request AgentStack managed hosting
              </Button>
            ) : hostingStatus === "requested" ? (
              <Button type="button" disabled>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Hosting request saved
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => setProviderKey("cloudflare")}
              >
                Open exact Cloudflare cutover checklist
              </Button>
            )}
            <Button
              variant="outline"
              render={<Link href={saPath("/website-transfer-preview")} />}
            >
              Back to comparison
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                openAskAssistant({
                  prompt:
                    "Explain the current hosting and DNS cutover status in plain language. Tell me only the next action I need to take and do not send me to an external dashboard.",
                })
              }
            >
              Ask Zack what this means
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border bg-slate-50 p-5">
          <h2 className="font-semibold">What AgentStack does next</h2>
          <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            {[
              "Create the isolated hosted deployment",
              "Verify the private URL and SSL certificate",
              "Unlock only the Cloudflare records you need",
            ].map((step, index) => (
              <li
                key={step}
                className="flex gap-3 rounded-xl border bg-white p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#173b7a] text-xs font-bold text-white">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="bg-gradient-to-r from-[#173b7a] to-[#315f9d] p-6 text-white">
          <p className="text-xs font-semibold tracking-[0.18em] text-pink-200 uppercase">
            Website replacement concierge
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            AgentStack recreates the site. You review and approve it.
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">
            You do not need to redesign pages or write code. We use your live
            website, Business Blueprint, approved media, and real-estate goals
            to prepare an exact private replacement while the current site stays
            online.
          </p>
        </div>

        <div className="grid gap-px bg-slate-200 sm:grid-cols-5">
          {[
            [
              Search,
              "1",
              "Find current setup",
              "Identify domain, DNS, host, and site source.",
            ],
            [
              Code2,
              "2",
              "Copy design + code",
              "Recreate structure, content, forms, and mobile layout.",
            ],
            [
              Sparkles,
              "3",
              "Improve privately",
              "Apply the Blueprint, compliance, SEO, and AI features.",
            ],
            [
              Eye,
              "4",
              "Review replacement",
              "Compare the private build with the current live site.",
            ],
            [
              Rocket,
              "5",
              "Approve cutover",
              "Change only the required DNS record after approval.",
            ],
          ].map(([Icon, number, title, detail]) => (
            <div key={String(number)} className="bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-[#173b7a]">
                  {String(number)}
                </span>
                <Icon className="h-4 w-4 text-pink-500" />
              </div>
              <p className="mt-3 text-sm font-semibold">{String(title)}</p>
              <p className="text-muted-foreground mt-1 text-[11px] leading-4">
                {String(detail)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="font-semibold">Your existing website remains live.</p>
            <p className="mt-1 text-xs leading-5">
              AgentStack will not move the registrar, cancel hosting, change
              nameservers, or publish the replacement automatically. Email and
              the current site stay untouched until you approve the new build
              and its final cutover checklist.
            </p>
          </div>
        </div>
      </section>

      {isCutover ? (
        <section className="rounded-2xl border-2 border-blue-300 bg-blue-50/70 p-6 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.16em] text-blue-700 uppercase">
            Step 5 — safe DNS cutover
          </p>
          <h2 className="mt-1 text-xl font-bold">
            Keep the live site connected until hosting is ready
          </h2>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm leading-6">
            You are in AgentStack&apos;s cutover workspace. DNS changes stay
            locked until the approved replacement has a dedicated hosting URL
            and SSL target. This prevents the domain from opening the AgentStack
            app or a generic Vercel dashboard.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <CutoverStatus
              label="Replacement"
              value={replacementApproved ? "Approved" : "Approval required"}
              complete={replacementApproved}
            />
            <CutoverStatus
              label="Managed hosting"
              value={
                hostingTargetReady ? "Target ready" : "Target not provisioned"
              }
              complete={hostingTargetReady}
            />
            <CutoverStatus
              label="DNS provider"
              value={detectedDnsProvider ?? "Confirm below"}
              complete={Boolean(detectedDnsProvider)}
            />
          </div>
          {!hostingTargetReady ? (
            <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-semibold">No DNS changes yet</p>
              <p className="mt-1 text-xs leading-5">
                The visual replacement is approved, but its standalone hosting
                destination has not been created. Zack can explain the saved
                status and guide the hosting handoff without sending you to an
                external dashboard blindly.
              </p>
            </div>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                openAskAssistant({
                  prompt:
                    "Review my approved website replacement and current DNS provider. Tell me exactly what remains before managed hosting can be provisioned. Do not give DNS records until a dedicated hosting target is verified.",
                })
              }
            >
              Ask Zack for the next hosting step
            </Button>
            <Button
              variant="outline"
              render={<Link href={saPath("/website-transfer-preview")} />}
            >
              Back to comparison
            </Button>
          </div>
        </section>
      ) : null}

      <div className="bg-card rounded-2xl border p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
            <Globe className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold tracking-tight">
              Step 1 — identify and secure the website address
            </h2>
            <p className="text-muted-foreground text-xs">
              Tell us what you know. Zack guides anything you do not know.
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
                  <Check className="h-3 w-3" /> Saved — do not change DNS yet.
                  Build and approve the replacement first.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <Server className="h-4 w-4" /> Current provider discovery
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-900">
                A domain registrar, DNS provider, and website host can be three
                different companies. Finding the registrar does not require a
                transfer. AgentStack normally leaves registration and
                nameservers in place and changes only the final website record.
              </p>
              <a
                href="https://lookup.icann.org/en/lookup"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
              >
                Open ICANN Lookup, then paste {domain || "your domain"}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <details
              className="rounded-xl border p-4"
              onClick={(event) => {
                if (!replacementApproved || !hostingTargetReady) {
                  event.preventDefault();
                  toast.error(
                    !replacementApproved
                      ? "Review and approve the private replacement before opening DNS steps."
                      : "DNS stays locked until AgentStack verifies a dedicated hosting target."
                  );
                }
              }}
            >
              <summary className="cursor-pointer text-sm font-semibold">
                {replacementApproved && hostingTargetReady
                  ? "Final DNS records — hosting target verified"
                  : "Final DNS records — locked until replacement and hosting are ready"}
              </summary>
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium">
                  At cutover, AgentStack will confirm which of these records
                  apply:
                </p>
                <div className="space-y-2">
                  {DNS_RECORDS.map((r) => (
                    <div
                      key={r.type + r.name}
                      className="rounded-lg border p-2.5"
                    >
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
                  DNS changes can take a few minutes to a few hours to take
                  effect. Once they propagate, your site will resolve at your
                  domain. Your agency adds the domain in the hosting dashboard
                  to issue the SSL certificate.
                </p>
              </div>
            </details>
            <div>
              <p className="mb-2 text-xs font-medium">
                Open the account where your domain or website currently lives:
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PROVIDER_PORTALS.map((provider) => (
                  <button
                    key={provider.name}
                    type="button"
                    onClick={() => {
                      setProviderKey(provider.key);
                      setProviderConfirmed(false);
                      setProviderOutcome(null);
                    }}
                    className={`bg-background flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors hover:border-blue-300 ${providerKey === provider.key ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/15" : ""}`}
                  >
                    <div>
                      <div className="font-medium">{provider.name}</div>
                      <div className="text-muted-foreground text-[11px]">
                        {provider.note}
                      </div>
                    </div>
                    <ExternalLink className="text-muted-foreground h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
            {selectedProvider ? (
              <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/70 p-5">
                <p className="text-xs font-semibold tracking-[0.16em] text-blue-700 uppercase">
                  Guided provider check
                </p>
                <h3 className="mt-1 text-base font-semibold">
                  Keep this AgentStack checklist open
                </h3>
                <p className="text-muted-foreground mt-1 text-xs leading-5">
                  {selectedProvider.name} opens in a separate tab. Complete only
                  the discovery steps below, then return here. You are not
                  connecting or changing DNS yet.
                </p>
                <ol className="mt-4 space-y-2">
                  {selectedProvider.steps.map((step, index) => (
                    <li
                      key={step}
                      className="flex gap-3 rounded-xl border bg-white p-3 text-sm"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#173b7a] text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      window.open(
                        selectedProvider.url,
                        "agentstack-provider-check",
                        "noopener,noreferrer"
                      )
                    }
                  >
                    Open {selectedProvider.name}
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setProviderOutcome("found");
                      setProviderConfirmed(true);
                    }}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />I found{" "}
                    {domain || "my domain"}
                  </Button>
                  {selectedProvider.key === "cloudflare" ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setProviderOutcome("empty");
                        setProviderConfirmed(true);
                      }}
                    >
                      My Domains list is empty
                    </Button>
                  ) : null}
                </div>
                {providerConfirmed ? (
                  <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="font-semibold">
                        {providerOutcome === "empty"
                          ? "Cloudflare registration found; website zone not found."
                          : "Provider found. Discovery is complete."}
                      </p>
                      <p className="mt-1 text-xs leading-5">
                        {providerOutcome === "empty"
                          ? "That is not a blocker. ICANN confirms Cloudflare is the registrar and nameserver provider, while this account shows no active website zone. AgentStack can copy the public site now. Before launch, Zack will help locate the correct Cloudflare account or add the domain safely—without transferring the registration or interrupting the live site."
                          : "Leave that account unchanged. Continue below so AgentStack can build the private replacement before any cutover instructions appear."}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
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
                  ICANN Lookup can identify the registrar from the website
                  address even when you cannot remember where it was purchased.
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
                  receives domain renewal receipts. Search that inbox for
                  “domain renewal,” “registrar,” or the domain name.
                </p>
              </li>
            </ol>
            <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Keep the current DNS unchanged until the AgentStack replacement
              has been reviewed and approved. This keeps the existing website
              and email online.
            </div>
            <Button variant="outline" onClick={() => setTab("existing")}>
              I found my provider
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-muted-foreground text-sm">
              Don&apos;t have a domain yet? Register one at any of these — a
              .com for your name or market (e.g.{" "}
              <span className="font-medium">janedoe-homes.com</span>) usually
              runs $10–15/year. Then come back and connect it under &ldquo;I
              have a domain.&rdquo;
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
              Tip: pick something short, easy to say on a call, and close to
              your name or farm area. Avoid hyphens and numbers where you can.
            </p>
          </div>
        )}
      </div>

      {saved ? (
        <section className="bg-card rounded-2xl border p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-pink-500 uppercase">
                Step 2 — replacement build
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Let AgentStack reproduce the site design and code
              </h2>
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
                Open a private build using the current site as the visual and
                content reference. AgentStack prepares the page structure,
                responsive code, forms, approved branding, and Blueprint copy.
                You receive a working preview—not a blank design canvas.
              </p>
            </div>
            <Button
              render={
                <a
                  href={
                    privatePreviewPath ??
                    saPath("/website-studio?mode=replacement")
                  }
                />
              }
            >
              {privatePreviewPath
                ? "Resume side-by-side comparison"
                : "Start private replacement"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              "Current site remains the public source of truth",
              "Private desktop and mobile comparison before launch",
              "One approval checklist for DNS, forms, analytics, and email",
            ].map((item) => (
              <div
                key={item}
                className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                {item}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs font-medium text-emerald-700">
            Provider discovery does not block the private build. Start now; Zack
            will keep the live site and DNS unchanged while the scan, report,
            and comparison are prepared.
          </p>
        </section>
      ) : null}
    </div>
  );
}

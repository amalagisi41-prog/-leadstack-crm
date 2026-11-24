"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Copy, PlugZap, Sparkles } from "lucide-react";
import { McpGuidedSetup } from "@/components/connect/mcp-guided-setup";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSubAccount } from "@/context/sub-account-context";

/**
 * The "Open AS MCP" connector card used to link straight at the raw
 * `/api/mcp` endpoint. Clicking it navigated the whole browser tab there
 * (the card's `external` check only treats `http...` hrefs as external, and
 * `/api/mcp` is relative) and landed on the endpoint's machine-readable
 * discovery JSON — meant for an MCP client's own GET probe, not for a human
 * to read. There was no page anywhere explaining what to do with the URL.
 * This page is that missing explanation: the endpoint, a copy button, and
 * the three steps an operator actually needs (paste the URL into their MCP
 * client, sign in, approve). It links back to /connect instead of hijacking
 * the tab the operator was already on.
 */
export function McpSetupPage() {
  const { saPath } = useSubAccount();
  const [copied, setCopied] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpoint = `${origin}/api/mcp`;

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      toast.success("Copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard blocked — select the URL and copy manually.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href={saPath("/connect")}
        className="text-muted-foreground inline-flex items-center gap-1.5 text-sm hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Connect
      </Link>

      <div className="mt-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PlugZap className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold">Connect an AI client over MCP</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            AgentStack runs an authenticated MCP server. Any MCP-compatible AI
            client (Claude, ChatGPT, or another tool that supports remote MCP
            connectors) can use it once you add the address below and sign in.
          </p>
        </div>
      </div>

      <McpGuidedSetup open={guideOpen} onOpenChange={setGuideOpen} />
      <Button className="mt-6" onClick={() => setGuideOpen(true)}>
        <Sparkles className="mr-1.5 h-4 w-4" /> Walk me through it
      </Button>

      <div className="bg-card mt-6 rounded-xl border p-4">
        <p className="text-sm font-medium">Your MCP server address</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="bg-muted flex-1 truncate rounded-md border px-3 py-2 text-xs">
            {endpoint || "Loading…"}
          </code>
          <Button size="sm" variant="outline" onClick={copyEndpoint} disabled={!endpoint}>
            {copied ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <h2 className="text-sm font-semibold">Setup steps</h2>
        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              1
            </span>
            <p>
              In your AI client, look for an option to add a remote MCP server
              or connector (in Claude, this is usually under Settings →
              Connectors; in other clients it may be called a &ldquo;custom
              connector&rdquo; or &ldquo;remote tool server&rdquo;).
            </p>
          </li>
          <li className="flex gap-3">
            <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              2
            </span>
            <p>Paste the address above as the server URL and save it.</p>
          </li>
          <li className="flex gap-3">
            <span className="bg-primary/10 text-primary flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
              3
            </span>
            <p>
              The client will open an AgentStack sign-in + approval prompt the
              first time it connects. Approve it with the AgentStack account
              you want the AI client acting on behalf of — it will only ever
              see the sub-accounts that account already has access to.
            </p>
          </li>
        </ol>
      </div>

      <div className="bg-muted/50 mt-6 rounded-xl border p-4 text-xs leading-relaxed">
        <p className="font-medium">What the AI client can do</p>
        <p className="text-muted-foreground mt-1">
          It can read your workspace&apos;s listing-sync status, look up one of
          your connected IDX Broker featured listings, and build reviewable
          draft marketing content (landing page, social captions, email, SMS)
          from that listing. Drafts are never auto-approved or auto-published —
          every one still goes through your normal review in AgentStack.
        </p>
      </div>
    </div>
  );
}

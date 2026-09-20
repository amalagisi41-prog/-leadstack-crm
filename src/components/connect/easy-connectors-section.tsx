"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  BookOpen,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Code2,
  KeyRound,
  LockKeyhole,
  PlugZap,
  ServerCog,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectorState = "connected" | "setup" | "external" | "coming_soon";

type Connector = {
  key: string;
  icon: React.ElementType;
  title: string;
  description: string;
  state: ConnectorState;
  href: string;
  action: string;
};

function StatePill({ state }: { state: ConnectorState }) {
  const copy: Record<ConnectorState, string> = {
    connected: "Connected",
    setup: "Connect in AgentStack",
    external: "External setup",
    coming_soon: "Planned",
  };

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
        state === "connected" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
        state === "setup" && "bg-primary/10 text-primary",
        state === "external" && "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        state === "coming_soon" && "bg-muted text-muted-foreground",
      )}
    >
      {copy[state]}
    </span>
  );
}

function ConnectorCard({ connector }: { connector: Connector }) {
  const external = connector.href.startsWith("http");
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <connector.icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{connector.title}</h3>
          <div className="mt-1">
            <StatePill state={connector.state} />
          </div>
        </div>
      </div>

      <p className="mt-3 min-h-12 text-xs leading-relaxed text-muted-foreground">
        {connector.description}
      </p>

      <div className="mt-4">
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-between"
          render={<Link
            href={connector.href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
          />}
        >
          {connector.action}
          {external ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
        </Button>
      </div>
    </div>
  );
}

export function EasyConnectorsSection() {
  const { subAccount, saPath } = useSubAccount();

  if (!subAccount) return null;

  const settingsHref = saPath("/dashboard/settings");
  const apiHref = settingsHref + "?tab=api";
  const calendarHref = settingsHref + "#calendar-connection";

  const calendarConnected = subAccount.calendarConfig?.status === "connected";
  const idxConnected =
    subAccount.idxEnabledByAgency === true &&
    subAccount.idxConfig?.enabled === true;

  const connectors: Connector[] = [
    {
      key: "openai",
      icon: Bot,
      title: "ChatGPT / OpenAI API",
      description:
        "Use OpenAI API credentials for AI features, automations, agents, or external tools. ChatGPT and API access are separate services, so connect the API only when a workflow needs it.",
      state: "external",
      href: "https://platform.openai.com/docs/quickstart",
      action: "Open OpenAI setup guide",
    },
    {
      key: "claude",
      icon: BrainCircuit,
      title: "Claude / Anthropic API",
      description:
        "Use Anthropic API access for Claude-powered workflows and developer tools. AgentStack should never ask for your normal Claude password.",
      state: "external",
      href: "https://docs.anthropic.com/en/docs/welcome",
      action: "Open Claude setup guide",
    },
    {
      key: "mcp",
      icon: PlugZap,
      title: "MCP — connect AI to AgentStack",
      description:
        "Model Context Protocol provides a standard way for AI hosts to connect to tools and data. Use this when you want Claude, ChatGPT-compatible tooling, or another MCP host to work with AS capabilities.",
      state: "coming_soon",
      href: "https://modelcontextprotocol.io/",
      action: "Learn about MCP",
    },
    {
      key: "agentstack-api",
      icon: KeyRound,
      title: "AgentStack API & webhooks",
      description:
        "Create a scoped AgentStack API key for Zapier, Make, custom sites, or server-to-server integrations. Keys are shown once and should be treated as secrets.",
      state: "setup",
      href: apiHref,
      action: "Manage API access",
    },
    {
      key: "google-calendar",
      icon: Calendar,
      title: "Google Calendar",
      description:
        "Authorize the Google account you already use. OAuth keeps credentials server-side; no calendar password or feed URL is required.",
      state:
        calendarConnected && subAccount.calendarConfig?.provider === "google"
          ? "connected"
          : "setup",
      href: calendarHref,
      action:
        calendarConnected && subAccount.calendarConfig?.provider === "google"
          ? "Manage connection"
          : "Connect Google",
    },
    {
      key: "microsoft-calendar",
      icon: Calendar,
      title: "Microsoft 365 / Outlook",
      description:
        "Authorize the Microsoft account you already use for scheduling. AgentStack uses OAuth rather than asking for your Microsoft password.",
      state:
        calendarConnected && subAccount.calendarConfig?.provider === "outlook"
          ? "connected"
          : "setup",
      href: calendarHref,
      action:
        calendarConnected && subAccount.calendarConfig?.provider === "outlook"
          ? "Manage connection"
          : "Connect Outlook",
    },
    {
      key: "wordpress",
      icon: Code2,
      title: "WordPress / CMS",
      description:
        "For managed listing publishing and website content, use a dedicated WordPress Application Password or another supported API credential — never the user's main WordPress password.",
      state: "coming_soon",
      href: "https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/",
      action: "View WordPress API guide",
    },
    {
      key: "idx",
      icon: ServerCog,
      title: "IDX Broker / MLS",
      description:
        "Connect the authorized IDX Broker account to bring approved MLS inventory into AgentStack. AgentStack keeps IDX credentials server-side.",
      state: idxConnected ? "connected" : "setup",
      href: idxConnected ? settingsHref + "#mls-feed" : saPath("/idx"),
      action: idxConnected ? "Manage MLS connection" : "Set up MLS feed",
    },
  ];

  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Easy Connectors & Assistance</h2>
              <p className="text-xs text-muted-foreground">
                A guided home for the services you may need now or later.
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            AgentStack works best when the systems around it are connected correctly.
            This area separates connections AgentStack can manage today from
            third-party setup you complete with the provider. When you are unsure
            what a key, OAuth permission, webhook, or MCP server is for, start here.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" />
          Secrets stay server-side
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {connectors.map((connector) => (
          <ConnectorCard key={connector.key} connector={connector} />
        ))}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-dashed p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Before you paste a key
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Use a key created specifically for AgentStack, grant the smallest
            permissions needed, and never put a secret in a browser, public form,
            email, screenshot, or source repository.
          </p>
        </div>

        <div className="rounded-xl border border-dashed p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BookOpen className="h-4 w-4 text-primary" />
            What AgentStack can help with
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            We can tell you which provider to use, what credential type to create,
            what permission scope is needed, where to enter it in AS, and how to
            verify the connection without exposing the secret.
          </p>
        </div>

        <div className="rounded-xl border border-dashed p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Connection verification
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            After a connection is added, the goal is a clear status, the connected
            account or provider, the last successful check, and a repair path when
            credentials expire or permissions change.
          </p>
        </div>
      </div>
    </section>
  );
}

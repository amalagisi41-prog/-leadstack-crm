"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  BookOpen,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Code2,
  KeyRound,
  LockKeyhole,
  MapPin,
  PlugZap,
  Share2,
  ServerCog,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectorState = "connected" | "setup" | "external" | "available" | "coming_soon";

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
    available: "Available now",
    coming_soon: "Planned",
  };

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
        state === "connected" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
        state === "setup" && "bg-primary/10 text-primary",
        state === "external" && "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        state === "available" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
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
  const [goal, setGoal] = useState<"website" | "listings" | "reach" | "leads" | "ai" | null>(null);

  if (!subAccount) return null;

  const settingsHref = saPath("/dashboard/settings");
  const apiHref = settingsHref + "?tab=api";
  const calendarHref = settingsHref + "#calendar-connection";
  const idxConnected =
    subAccount.idxEnabledByAgency === true &&
    subAccount.idxConfig?.connected === true;

  const goalChoices = [
    {
      id: "website" as const,
      title: "Get my website working",
      description: "Connect your domain, review your existing site, or build with AgentStack.",
      icon: Sparkles,
    },
    {
      id: "listings" as const,
      title: "Get my listings working",
      description: "Connect MLS/IDX, add your own properties, or use both in one inventory.",
      icon: MapPin,
    },
    {
      id: "reach" as const,
      title: "Get found & connected",
      description: "Connect Google, Facebook, Instagram, reviews, and your business channels.",
      icon: Share2,
    },
    {
      id: "leads" as const,
      title: "Get leads handled",
      description: "Connect forms, contacts, email, calendar, texting, and follow-up.",
      icon: PlugZap,
    },
    {
      id: "ai" as const,
      title: "Add automation & AI",
      description: "Use AgentStack AI, API/webhooks, MCP, or an external AI provider.",
      icon: Bot,
    },
  ];

  const followUps = {
    website: {
      question: "Which sounds like you?",
      options: [
        { title: "I already have a website", description: "Keep your site and connect the domain/content to AgentStack.", href: saPath("/domain"), action: "Connect my website" },
        { title: "I need a website", description: "Use AgentStack's website tools and connect your domain when you're ready.", href: saPath("/domain"), action: "Start my website" },
        { title: "I'm not sure", description: "AS can review what you have and point you to the shortest path.", href: saPath("/domain"), action: "Let AS guide me" },
      ],
    },
    listings: {
      question: "What kind of listings do you have?",
      options: [
        { title: "MLS / IDX listings", description: "Connect your authorized IDX Broker feed and bring approved MLS inventory into AgentStack.", href: idxConnected ? settingsHref + "#mls-feed" : saPath("/idx"), action: idxConnected ? "Manage MLS" : "Connect MLS" },
        { title: "My own / off-market listings", description: "Add agent-managed properties without waiting for an MLS feed.", href: saPath("/listings"), action: "Add my listings" },
        { title: "Both", description: "Keep MLS and agent-managed inventory together with source ownership preserved.", href: idxConnected ? settingsHref + "#mls-feed" : saPath("/idx"), action: "Set up my listing sources" },
      ],
    },
    reach: {
      question: "Where do you want to be connected first?",
      options: [
        { title: "Google", description: "Open Business Brain for your business profile, reviews, and Google setup.", href: saPath("/business-profile"), action: "Connect Google" },
        { title: "Facebook & Instagram", description: "Authorize Meta so messages can flow into Conversations and publishing can use your connected page.", href: settingsHref, action: "Connect social" },
        { title: "Both", description: "Start with Google and social; AS will keep the next step clear.", href: saPath("/business-profile"), action: "Start connections" },
      ],
    },
    leads: {
      question: "What do you want leads to do?",
      options: [
        { title: "Capture leads", description: "Use a Lead Form or website form so inquiries become People automatically.", href: saPath("/forms"), action: "Connect lead capture" },
        { title: "Follow up automatically", description: "Build Smart Workflows for email, SMS, assignments, and nurture.", href: saPath("/workflows"), action: "Set up follow-up" },
        { title: "Book appointments", description: "Connect Google or Outlook Calendar and use your public booking page.", href: calendarHref, action: "Connect my calendar" },
      ],
    },
    ai: {
      question: "How do you want to use AI?",
      options: [
        { title: "Use AgentStack AI", description: "Start with built-in assistants, web chat, workflows, and business context.", href: saPath("/ai-agents"), action: "Open AI" },
        { title: "Connect another AI", description: "Use MCP or provider API credentials when an external AI client needs AgentStack access.", href: apiHref, action: "Connect AI tools" },
        { title: "I'm not sure", description: "AS can start with the built-in tools and add an external connector only when you need it.", href: saPath("/ai-agents"), action: "Let AS guide me" },
      ],
    },
  } as const;

  const activeFollowUp = goal ? followUps[goal] : null;

  const connectors: Connector[] = [
    {
      key: "openai",
      icon: Bot,
      title: "ChatGPT / OpenAI API",
      description: "Use OpenAI API credentials for AI features, automations, agents, or external tools. ChatGPT and API access are separate services.",
      state: "external",
      href: "https://platform.openai.com/docs/quickstart",
      action: "Open OpenAI guide",
    },
    {
      key: "claude",
      icon: BrainCircuit,
      title: "Claude / Anthropic API",
      description: "Use Anthropic API access for Claude-powered workflows and developer tools. AgentStack should never ask for your normal Claude password.",
      state: "external",
      href: "https://docs.anthropic.com/en/docs/welcome",
      action: "Open Claude guide",
    },
    {
      key: "mcp",
      icon: PlugZap,
      title: "MCP — connect AI to AgentStack",
      description: "AgentStack exposes an authenticated MCP server for MCP-compatible AI clients.",
      state: "available",
      href: "/api/mcp",
      action: "Open AS MCP",
    },
    {
      key: "agentstack-api",
      icon: KeyRound,
      title: "AgentStack API & webhooks",
      description: "Create a scoped AgentStack API key for Zapier, Make, custom sites, or server-to-server integrations.",
      state: "setup",
      href: apiHref,
      action: "Manage API access",
    },
    {
      key: "google-calendar",
      icon: Calendar,
      title: "Google Calendar",
      description: "Authorize the Google account you already use. OAuth keeps credentials server-side.",
      state: subAccount.calendarConfig?.status === "connected" && subAccount.calendarConfig.provider === "google" ? "connected" : "setup",
      href: calendarHref,
      action: subAccount.calendarConfig?.status === "connected" && subAccount.calendarConfig.provider === "google" ? "Manage" : "Connect Google",
    },
    {
      key: "microsoft-calendar",
      icon: Calendar,
      title: "Microsoft 365 / Outlook",
      description: "Authorize the Microsoft account you already use. OAuth keeps credentials server-side.",
      state: subAccount.calendarConfig?.status === "connected" && subAccount.calendarConfig.provider === "outlook" ? "connected" : "setup",
      href: calendarHref,
      action: subAccount.calendarConfig?.status === "connected" && subAccount.calendarConfig.provider === "outlook" ? "Manage" : "Connect Outlook",
    },
    {
      key: "wordpress",
      icon: Code2,
      title: "WordPress / CMS",
      description: "Use a dedicated WordPress Application Password or another supported API credential.",
      state: "coming_soon",
      href: "https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/",
      action: "View WordPress guide",
    },
    {
      key: "idx",
      icon: ServerCog,
      title: "IDX Broker / MLS",
      description: "Connect the authorized IDX Broker account to bring approved MLS inventory into AgentStack.",
      state: idxConnected ? "connected" : "setup",
      href: idxConnected ? settingsHref + "#mls-feed" : saPath("/idx"),
      action: idxConnected ? "Manage MLS" : "Connect MLS",
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
              <h2 className="text-base font-semibold">Let's get your business connected</h2>
              <p className="text-xs text-muted-foreground">AS asks a few questions and takes you to the shortest path.</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            You don't need to know which integration you need. Tell AgentStack what you want working first, and we'll guide the connection.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl border bg-background px-3 py-2 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" />
          You stay in control
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold">What do you want working first?</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goalChoices.map((choice) => (
            <Button
              key={choice.id}
              variant={goal === choice.id ? "default" : "outline"}
              className="h-auto justify-between rounded-xl p-4 text-left"
              onClick={() => setGoal(choice.id)}
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <choice.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{choice.title}</span>
                  <span className="mt-1 block text-xs font-normal leading-relaxed opacity-80">{choice.description}</span>
                </span>
              </span>
              <ArrowRight className="ml-3 h-4 w-4 shrink-0" />
            </Button>
          ))}
        </div>
      </div>

      {activeFollowUp ? (
        <div className="mt-5 rounded-xl border bg-background p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{activeFollowUp.question}</p>
              <p className="mt-1 text-xs text-muted-foreground">Pick the answer closest to your situation. AS will take you to the next step.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setGoal(null)}>Start over</Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {activeFollowUp.options.map((option) => (
              <Button
                key={option.title}
                variant="outline"
                className="h-auto items-start justify-start rounded-xl p-4 text-left"
                render={<Link href={option.href} />}
              >
                <span>
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="mt-1 block text-xs font-normal leading-relaxed text-muted-foreground">{option.description}</span>
                  <span className="mt-3 block text-xs font-semibold text-primary">{option.action} <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <details className="mt-5 rounded-xl border bg-background">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
          I need a specific connection
        </summary>
        <div className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4">
          {connectors.map((connector) => (
            <ConnectorCard key={connector.key} connector={connector} />
          ))}
        </div>
      </details>

      <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p>Use provider authorization or a key created specifically for AgentStack. Never paste secrets into chat, screenshots, email, or public forms.</p>
      </div>
    </section>
  );
}

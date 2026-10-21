"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  Copy,
  HelpCircle,
  Loader2,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  GuidedFlow,
  type GuidedAnswers,
  type GuidedStep,
} from "@/components/guided-flow/guided-flow";
import { useSubAccount } from "@/context/sub-account-context";
import { SUB_ACCOUNT_ROUTES } from "@/lib/navigation/sub-account-routes";
import {
  mcpSettingsHint,
  mcpSetupStepIds,
  type McpAiApp,
} from "@/lib/mcp/setup-flow";

interface ConnectionStatus {
  connected: boolean;
  clientName: string | null;
  connectedAt: string | null;
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Clipboard blocked — select the text and copy it manually.");
    }
  }
  return (
    <div className="flex items-center gap-2">
      <code className="bg-muted flex-1 break-all rounded-md border px-3 py-2 text-xs">{value}</code>
      <Button size="sm" variant="outline" onClick={copy} aria-label={label}>
        {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function VerifyPanel({
  appName,
  status,
  checking,
  onCheck,
}: {
  appName: string;
  status: ConnectionStatus | null;
  checking: boolean;
  onCheck: () => void;
}) {
  if (status?.connected) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
        <p className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Connected
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          {status.clientName ?? appName} signed in to AgentStack
          {status.connectedAt ? ` on ${new Date(status.connectedAt).toLocaleString()}` : ""}.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p>
        We&apos;ll check AgentStack for a completed sign-in from {appName}. This only
        turns green once the approval actually went through.
      </p>
      <Button size="sm" onClick={onCheck} disabled={checking}>
        {checking ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
        Check my connection
      </Button>
      {status && !status.connected ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="font-medium">Not connected yet.</p>
          <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-4">
            <li>Make sure you saved the connector in {appName}.</li>
            <li>Look for an AgentStack sign-in window — it may have opened in a new tab.</li>
            <li>Click &ldquo;Approve connection&rdquo; while signed in to this same AgentStack account.</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function McpGuidedSetup({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { subAccount, saPath } = useSubAccount();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "";

  async function checkConnection() {
    setChecking(true);
    try {
      const res = await fetch("/api/mcp/connection-status", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not check the connection.");
      setStatus((await res.json()) as ConnectionStatus);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check the connection.");
    } finally {
      setChecking(false);
    }
  }

  const subAccountId = subAccount?.id ?? "";
  const businessName = subAccount?.name ?? "my business";
  const firstPrompt = `Using AgentStack, show me the workspace status for sub-account ${subAccountId}.`;

  const buildSteps = useCallback(
    (answers: GuidedAnswers): GuidedStep[] => {
      const app = (answers.app as McpAiApp | undefined) ?? "other";
      const hint = mcpSettingsHint(app);
      const all: Record<string, GuidedStep> = {
        app: {
          id: "app",
          title: "Which AI app do you want to connect?",
          description:
            "This lets an AI app you already use read your AgentStack listings and draft marketing for you.",
          choices: [
            { id: "claude", label: "Claude", description: "claude.ai or the Claude desktop app", icon: BrainCircuit },
            { id: "chatgpt", label: "ChatGPT", description: "chatgpt.com or the ChatGPT app", icon: Bot },
            { id: "other", label: "Another AI app", description: "Any app that supports MCP connectors", icon: Sparkles },
            { id: "unsure", label: "I'm not sure what this is", description: "We'll help you decide", icon: HelpCircle },
          ],
        },
        "maybe-not-needed": {
          id: "maybe-not-needed",
          title: "You may not need this",
          description:
            "AgentStack already has a built-in assistant, Zack, that can draft listing marketing for you — no outside app or setup required.",
          choices: [
            { id: "zack", label: "Use the built-in assistant", description: "Recommended for most agents", icon: MessageSquare },
            { id: "continue", label: "I still want to connect an outside AI app", icon: Sparkles },
          ],
        },
        "use-zack": {
          id: "use-zack",
          title: "Use Zack inside AgentStack",
          final: true,
          body: () => (
            <div className="space-y-3">
              <p>Nothing to install. Zack already knows your business profile and listings.</p>
              <Button size="sm" render={<Link href={saPath(SUB_ACCOUNT_ROUTES.aiAgents)} />}>
                Open AI Agents
              </Button>
            </div>
          ),
        },
        "open-settings": {
          id: "open-settings",
          title: `Open ${hint.appName}'s connector settings`,
          body: () => (
            <ol className="list-decimal space-y-1.5 pl-5">
              {hint.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
              <li className="text-muted-foreground text-xs">
                Don&apos;t see this option? Custom connectors may need a paid plan in {hint.appName}.
              </li>
            </ol>
          ),
          continueLabel: "I'm there",
        },
        "copy-address": {
          id: "copy-address",
          title: "Paste this address into the connector",
          description: `Name it "AgentStack", paste this address as the server URL, and save.`,
          body: () => <CopyField value={endpoint} label="Copy MCP address" />,
          continueLabel: "I saved it",
        },
        approve: {
          id: "approve",
          title: "Approve the connection",
          body: () => (
            <div className="space-y-2">
              <p>
                {hint.appName} will open an AgentStack page titled <strong>Connect AgentStack</strong>.
                Click <strong>Approve connection</strong>.
              </p>
              <p className="text-muted-foreground text-xs">
                If it asks you to log in first, use this same AgentStack account. The AI app can
                only reach workspaces this account already has access to.
              </p>
            </div>
          ),
          continueLabel: "I approved it",
        },
        verify: {
          id: "verify",
          title: "Let's confirm it worked",
          body: () => (
            <VerifyPanel appName={hint.appName} status={status} checking={checking} onCheck={checkConnection} />
          ),
          canContinue: () => status?.connected === true,
        },
        "first-prompt": {
          id: "first-prompt",
          title: "You're connected — try your first request",
          final: true,
          body: () => (
            <div className="space-y-3">
              <p>
                Paste this into {hint.appName}. It includes your workspace ID for {businessName},
                which the AI needs to find the right account.
              </p>
              <CopyField value={firstPrompt} label="Copy first prompt" />
              <p className="text-muted-foreground text-xs">
                Next, try: &ldquo;Draft a campaign for listing #&lt;MLS number&gt; in sub-account {subAccountId}.&rdquo;
                Drafts are never published automatically — they wait for your review in AgentStack.
              </p>
            </div>
          ),
        },
      };
      return mcpSetupStepIds(answers).map((id) => all[id]);
    },
    [businessName, checking, endpoint, firstPrompt, saPath, status, subAccountId],
  );

  return <GuidedFlow open={open} onOpenChange={onOpenChange} steps={buildSteps} />;
}

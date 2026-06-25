"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FormInput,
  Loader2,
  Megaphone,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import type { ApiKeyResponse, ApiKeyScope } from "@/types/api";

/**
 * Quick start recipes — guided setup for the 3 most common API use cases.
 *
 * Sits above the raw API keys management section. Each recipe:
 *   - Has a one-click "Mint key for this" button that creates a key with
 *     a sensible preset name + scope (so the user doesn't have to know
 *     what "admin scope" means).
 *   - Renders step-by-step Zapier instructions with copy-paste code
 *     blocks for the URL, headers, and body template.
 *   - For the Slack recipe, redirects the user to the webhooks section
 *     because that's a different setup path.
 *
 * Plain text only — no screenshots. Zapier's UI evolves fast and stale
 * screenshots are worse than no screenshots.
 */

type RecipeId = "meta-ads" | "website-form" | "slack-alert";

interface Recipe {
  id: RecipeId;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  duration: string;
  presetName: string;
  presetScope: ApiKeyScope | null;
}

const RECIPES: Recipe[] = [
  {
    id: "meta-ads",
    title: "Capture Meta / Google ad leads",
    subtitle: "Send every Facebook / Google Lead Ads submission into LeadStack.",
    icon: Megaphone,
    duration: "~3 min in Zapier",
    presetName: "Zapier · Meta Lead Ads",
    presetScope: "admin",
  },
  {
    id: "website-form",
    title: "Submit a custom website form",
    subtitle: "Pipe Webflow / WordPress / Squarespace form submissions in.",
    icon: FormInput,
    duration: "~5 min on your site",
    presetName: "Webflow form ingest",
    presetScope: "forms-ingest",
  },
  {
    id: "slack-alert",
    title: "Slack alert on new leads",
    subtitle: "Get pinged in Slack the moment a contact or hot deal lands.",
    icon: MessageSquare,
    duration: "~5 min via Zapier",
    presetName: null as unknown as string,
    presetScope: null,
  },
];

export function SubAccountApiRecipesSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const gateOpen = subAccount?.apiAccessEnabledByAgency === true;
  const [openId, setOpenId] = useState<RecipeId | null>(null);
  const [mintedKey, setMintedKey] = useState<{
    recipeId: RecipeId;
    key: ApiKeyResponse;
  } | null>(null);
  const [minting, setMinting] = useState(false);

  if (!isAdmin) return null;

  // Hide the Quick start cards entirely when the agency gate is off —
  // showing recipes you can't actually use just creates confusion. The
  // API keys section below renders the locked-state message that
  // explains where to enable it.
  if (!gateOpen) return null;

  async function handleMint(recipe: Recipe) {
    if (!recipe.presetScope) return;
    setMinting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: recipe.presetName,
          mode: "live",
          scopes: [recipe.presetScope],
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        key?: ApiKeyResponse;
        error?: string;
      };
      if (!res.ok || !data.key) {
        throw new Error(data.error ?? "Failed to mint key.");
      }
      setMintedKey({ recipeId: recipe.id, key: data.key });
      toast.success("Key created — copy it now, you won't see it again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mint key.");
    } finally {
      setMinting(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied.");
    } catch {
      toast.error("Clipboard blocked — copy manually.");
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Quick start</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Three preset integrations. Pick one, mint the right key for it,
            follow the steps. You can always set up something custom below.
          </p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {RECIPES.map((r) => {
          const Icon = r.icon;
          const isOpen = openId === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setOpenId(isOpen ? null : r.id);
                if (mintedKey?.recipeId !== r.id) setMintedKey(null);
              }}
              className={`group rounded-lg border p-3 text-left transition-colors ${
                isOpen
                  ? "border-primary bg-primary/5"
                  : "border-input bg-background hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {r.subtitle}
                  </p>
                  <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {r.duration}
                  </p>
                </div>
                <span className="text-muted-foreground">
                  {isOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {openId === "meta-ads" && (
        <MetaAdsGuide
          mintedKey={mintedKey?.recipeId === "meta-ads" ? mintedKey.key : null}
          minting={minting}
          onMint={() =>
            handleMint(RECIPES.find((r) => r.id === "meta-ads")!)
          }
          onCopy={copy}
        />
      )}
      {openId === "website-form" && (
        <WebsiteFormGuide
          mintedKey={
            mintedKey?.recipeId === "website-form" ? mintedKey.key : null
          }
          minting={minting}
          onMint={() =>
            handleMint(RECIPES.find((r) => r.id === "website-form")!)
          }
          onCopy={copy}
        />
      )}
      {openId === "slack-alert" && <SlackAlertGuide />}
    </section>
  );
}

// ── Recipe 1: Meta / Google Ads ─────────────────────────────────────────

function MetaAdsGuide({
  mintedKey,
  minting,
  onMint,
  onCopy,
}: {
  mintedKey: ApiKeyResponse | null;
  minting: boolean;
  onMint: () => void;
  onCopy: (text: string) => Promise<void>;
}) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const endpoint = `${baseUrl}/api/v1/contacts`;
  const bodyTemplate = `{
  "name": "{{Full Name from Meta}}",
  "email": "{{Email from Meta}}",
  "phone": "{{Phone from Meta}}",
  "source": "meta-lead-ads"
}`;
  return (
    <div className="mt-4 space-y-4 rounded-lg border bg-background p-4">
      <Step n={1} title="Mint your API key">
        <p>
          One click — we&apos;ll name it <Code>Zapier · Meta Lead Ads</Code>{" "}
          and give it the right permissions. You can revoke it any time
          below.
        </p>
        {mintedKey?.secret ? (
          <KeyReveal secret={mintedKey.secret} onCopy={() => onCopy(mintedKey.secret!)} />
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onMint}
            disabled={minting}
            className="mt-2"
          >
            {minting ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              "Create my Meta Lead Ads key"
            )}
          </Button>
        )}
      </Step>

      <Step n={2} title="Connect Zapier">
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            Open{" "}
            <ExtLink href="https://zapier.com/app/zaps">zapier.com</ExtLink>{" "}
            → <strong>Create Zap</strong>.
          </li>
          <li>
            For the <strong>Trigger</strong>, search &quot;Facebook Lead Ads&quot;
            (or &quot;Google Lead Form Extensions&quot;). Pick{" "}
            <strong>New Lead</strong>. Connect your ad account and pick the
            form you want to capture.
          </li>
          <li>
            For the <strong>Action</strong>, search &quot;Webhooks by Zapier&quot;.
            Pick <strong>POST</strong>.
          </li>
          <li>
            Configure the action with the values below — copy each into the
            matching Zapier field.
          </li>
        </ol>
      </Step>

      <Step n={3} title="Paste these into Zapier">
        <Field
          label="URL"
          value={endpoint}
          onCopy={() => onCopy(endpoint)}
          hint='Zapier calls this field "URL".'
        />
        <Field
          label="Payload type"
          value="json"
          onCopy={() => onCopy("json")}
          hint='Zapier calls this "Payload Type". Pick "Json".'
        />
        <Field
          label="Headers"
          value={`Authorization: Bearer ${mintedKey?.secret ?? "<paste your key from step 1>"}\nContent-Type: application/json`}
          onCopy={() =>
            onCopy(
              `Authorization: Bearer ${mintedKey?.secret ?? "<paste your key from step 1>"}\nContent-Type: application/json`,
            )
          }
          hint="Two headers. Add them one at a time in Zapier's Headers section."
          multiline
        />
        <Field
          label="Data (request body)"
          value={bodyTemplate}
          onCopy={() => onCopy(bodyTemplate)}
          hint="Replace the {{...}} placeholders with the matching fields from your Meta lead. Zapier shows them as a dropdown when you click the field."
          multiline
        />
      </Step>

      <Step n={4} title="Test it">
        <p>
          In Zapier hit <strong>Test action</strong>. You should see a 201
          response and a new contact appear in your dashboard within
          seconds. If you see a 401, the Authorization header didn&apos;t copy
          correctly — re-paste it.
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Publish the Zap when the test passes. Meta lead webhooks fire
          within ~1 minute of submission in production.
        </p>
      </Step>
    </div>
  );
}

// ── Recipe 2: Website form ──────────────────────────────────────────────

function WebsiteFormGuide({
  mintedKey,
  minting,
  onMint,
  onCopy,
}: {
  mintedKey: ApiKeyResponse | null;
  minting: boolean;
  onMint: () => void;
  onCopy: (text: string) => Promise<void>;
}) {
  const { subAccountId } = useSubAccount();
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  // Operator picks the form id from their Forms list; we can't pre-fill it
  // without a server lookup. Use a placeholder and tell them where to find it.
  const endpoint = `${baseUrl}/api/v1/forms/FORM_ID_HERE/submissions`;
  return (
    <div className="mt-4 space-y-4 rounded-lg border bg-background p-4">
      <Step n={1} title="Find your form's ID">
        <p>
          Open the <strong>Forms</strong> tab in your sidebar (or{" "}
          <ExtLink href={`/sa/${subAccountId}/forms`}>this link</ExtLink>).
          Click into the form you want to receive submissions for. Copy the
          form id from the URL — it&apos;s the part after <Code>/forms/</Code>.
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Don&apos;t have a form yet? Click <strong>+ New form</strong> in the
          Forms tab. The form&apos;s field configuration controls what data
          ends up on the contact.
        </p>
      </Step>

      <Step n={2} title="Mint a forms-ingest key">
        <p>
          Forms-ingest keys are <strong>write-only</strong> and can&apos;t do
          anything except submit forms. That makes them safe to embed in
          your website&apos;s HTML if needed.
        </p>
        {mintedKey?.secret ? (
          <KeyReveal secret={mintedKey.secret} onCopy={() => onCopy(mintedKey.secret!)} />
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onMint}
            disabled={minting}
            className="mt-2"
          >
            {minting ? (
              <>
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                Creating…
              </>
            ) : (
              "Create my Webflow form key"
            )}
          </Button>
        )}
      </Step>

      <Step n={3} title="Configure your site">
        <p>
          If your site uses <strong>Webflow / WordPress / Squarespace</strong>,
          their form builder lets you set a <em>form action URL</em>. Point
          it at:
        </p>
        <Field
          label="Form action URL"
          value={endpoint}
          onCopy={() => onCopy(endpoint)}
          hint="Replace FORM_ID_HERE with the id you copied in step 1."
        />
        <p className="mt-3 text-[11px] text-muted-foreground">
          Some platforms (Webflow especially) need a small JS snippet to
          POST as JSON rather than form-encoded. If your form doesn&apos;t
          land, ask your developer (or post in your support channel) to
          fetch-POST with{" "}
          <Code>Content-Type: application/json</Code> and the body shape{" "}
          <Code>{`{ "values": { "field_id": "value" } }`}</Code>.
        </p>
      </Step>

      <Step n={4} title="Test from your site">
        <p>
          Submit a real form from your live site (or a staging copy). The
          new contact should appear in your Contacts list within seconds,
          with <Code>source: website-form</Code> on it. Any automation
          attached to the form (Speed-to-Lead, etc.) fires the same way as
          a submission from a LeadStack-hosted form.
        </p>
      </Step>
    </div>
  );
}

// ── Recipe 3: Slack alert ───────────────────────────────────────────────

function SlackAlertGuide() {
  return (
    <div className="mt-4 space-y-4 rounded-lg border bg-background p-4">
      <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-900 dark:text-blue-300">
        <p className="font-medium">
          This recipe uses a <strong>Webhook</strong>, not an API key.
        </p>
        <p className="mt-1 text-blue-800/80 dark:text-blue-300/80">
          You&apos;ll set the destination once below, then never think about
          it again. Scroll down to the <strong>Webhooks</strong> section
          when you reach step 3.
        </p>
      </div>

      <Step n={1} title="Set up Zapier as the bridge">
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            Open{" "}
            <ExtLink href="https://zapier.com/app/zaps">zapier.com</ExtLink>{" "}
            → <strong>Create Zap</strong>.
          </li>
          <li>
            For the <strong>Trigger</strong>, search &quot;Webhooks by Zapier&quot;.
            Pick <strong>Catch Hook</strong>.
          </li>
          <li>
            Zapier shows you a <strong>Custom Webhook URL</strong> — copy
            it. You&apos;ll paste it into LeadStack in step 3.
          </li>
          <li>
            For the <strong>Action</strong>, pick <strong>Slack</strong> →{" "}
            <strong>Send Channel Message</strong>. Connect Slack and pick
            the channel.
          </li>
          <li>
            In the message body, drag Zapier&apos;s data fields into the
            Slack message — e.g., <Code>{`New lead: {{Contact Name}} ({{Contact Email}})`}</Code>.
          </li>
        </ol>
      </Step>

      <Step n={2} title="Decide which events you care about">
        <p>The popular picks for a sales-ops Slack channel:</p>
        <ul className="ml-4 list-disc space-y-0.5 text-sm">
          <li>
            <Code>contact.created</Code> — every new lead
          </li>
          <li>
            <Code>deal.won</Code> — every closed deal (the celebration ping)
          </li>
          <li>
            <Code>form.submitted</Code> — every form submission with full
            field values
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          You can subscribe to any combination. Picking only the ones you
          care about avoids Slack noise.
        </p>
      </Step>

      <Step n={3} title="Add the webhook in LeadStack">
        <ol className="ml-4 list-decimal space-y-1.5">
          <li>
            Scroll to the <strong>Webhooks</strong> section on this page.
          </li>
          <li>
            Click <strong>+ New webhook</strong>.
          </li>
          <li>
            Paste the Zapier <strong>Custom Webhook URL</strong> from step 1
            as the destination.
          </li>
          <li>
            Pick the events you decided on in step 2. Save.
          </li>
        </ol>
      </Step>

      <Step n={4} title="Test the end-to-end">
        <p>
          In LeadStack, create a test contact (Contacts → + New). The Zap
          should fire within seconds, and the Slack channel should show
          the message. If nothing appears: open Zapier&apos;s{" "}
          <strong>Zap History</strong> to see whether the webhook arrived
          there or whether Slack rejected the message format.
        </p>
      </Step>

      <Step n={5} title="Power-user note">
        <p className="text-[11px] text-muted-foreground">
          Want to skip Zapier and post directly to Slack? Slack accepts a
          specific JSON shape that LeadStack doesn&apos;t emit verbatim. You
          can put a small serverless function (Vercel, Cloudflare Worker)
          in between to transform — but for most agencies, the Zapier
          bridge is faster to set up + easier to modify.
        </p>
      </Step>
    </div>
  );
}

// ── Shared pieces ───────────────────────────────────────────────────────

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {n}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="ml-7 space-y-1 text-xs leading-relaxed">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onCopy,
  hint,
  multiline,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  hint?: string;
  multiline?: boolean;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCopy}
          className="h-6 px-2 text-[11px]"
        >
          <Copy className="mr-1 h-3 w-3" />
          Copy
        </Button>
      </div>
      <pre
        className={`overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] ${
          multiline ? "whitespace-pre" : "whitespace-nowrap"
        }`}
      >
        <code>{value}</code>
      </pre>
      {hint && (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function KeyReveal({
  secret,
  onCopy,
}: {
  secret: string;
  onCopy: () => void;
}) {
  return (
    <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-[11px] font-medium text-amber-900 dark:text-amber-200">
          Key created. Copy it now — you won&apos;t see it again. Stored on
          your team&apos;s side in Zapier; revoke any time below.
        </p>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-md border bg-background p-2 font-mono text-[11px]">
        <code className="min-w-0 flex-1 break-all">{secret}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCopy}
          className="h-7 shrink-0 px-2"
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  );
}

function ExtLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const internal = href.startsWith("/");
  return (
    <a
      href={href}
      target={internal ? undefined : "_blank"}
      rel={internal ? undefined : "noopener noreferrer"}
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {children}
      {!internal && <ExternalLink className="ml-0.5 inline h-3 w-3" />}
    </a>
  );
}

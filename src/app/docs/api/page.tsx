import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "API reference",
  description:
    "Public REST API for the LeadStack CRM platform — authentication, resources, webhooks.",
};

/**
 * Public API reference. Single page, schema-driven structure. Lives at
 * /docs/api and is added to PUBLIC_PATHS in middleware (the /docs prefix).
 *
 * The reference is intentionally a single long page — easier to grep
 * with Ctrl+F than navigating a multi-page docs site, matches Stripe's
 * top-page format which is the gold standard agencies expect.
 */
export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-10">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          API Reference · v2026-06-15
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          LeadStack public API
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          REST + outbound webhooks for the LeadStack CRM. Sub-account-scoped
          Bearer auth, idempotent writes, signed webhooks, request log
          observability.
        </p>
      </header>

      <Toc />

      <Section id="quickstart" title="Quickstart">
        <p>
          1. Mint a key in <Code>Settings → API keys</Code>. Copy the{" "}
          <Code>lsk_live_...</Code> value — you only see it once.
        </p>
        <p className="mt-3">
          2. Send a request. Authentication is HTTP Bearer:
        </p>
        <Pre>{`curl https://YOUR_DEPLOYMENT/api/v1/contacts \\
  -H "Authorization: Bearer lsk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Acme Corp","email":"hello@acme.com"}'`}</Pre>
        <p className="mt-3">
          3. Listen for events. Add a webhook in{" "}
          <Code>Settings → Webhooks</Code>, copy the signing secret, verify
          each delivery with HMAC-SHA256.
        </p>
      </Section>

      <Section id="auth" title="Authentication">
        <p>
          Bearer-token auth on every request. Keys are scoped to one
          sub-account and one mode (live or test).
        </p>
        <H3>Key format</H3>
        <Pre>{`lsk_<mode>_<8-char-prefix>_<32-char-secret>
e.g. lsk_live_AB12CD34_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</Pre>
        <H3>Scopes</H3>
        <ul className="ml-6 list-disc space-y-1 text-sm">
          <li>
            <Code>admin</Code> — full CRUD across every resource. Server-to-server only.
          </li>
          <li>
            <Code>forms-ingest</Code> — write-only on{" "}
            <Code>POST /v1/forms/:id/submissions</Code>. Safe to embed in
            client-side JS. Only endpoint with open CORS.
          </li>
        </ul>
        <H3>Live vs test mode</H3>
        <p>
          Live and test data are walled off entirely. A test-mode key
          cannot read or modify live data, and vice versa. Test-mode form
          submissions skip the Speed-to-Lead automation (no real emails or
          SMS fire).
        </p>
      </Section>

      <Section id="versioning" title="Versioning">
        <p>
          Versions are date-coded. Pin a request with{" "}
          <Code>LeadStack-Version: 2026-06-15</Code>. If omitted, the
          request resolves to the version stamped on your key at mint time
          — so existing integrations don&apos;t break when we release a new
          version.
        </p>
        <p className="mt-3">
          Current version: <Code>2026-06-15</Code>.
        </p>
      </Section>

      <Section id="errors" title="Errors">
        <p>
          All error responses share a stable shape. Discriminate on{" "}
          <Code>code</Code>, not <Code>message</Code>.
        </p>
        <Pre>{`{
  "error": {
    "type": "invalid_request",
    "code": "invalid_body",
    "message": "\`name\` is required (string ≤ 200 chars).",
    "request_id": "req_..."
  }
}`}</Pre>
        <p className="mt-3">
          The <Code>request_id</Code> matches the <Code>X-Request-Id</Code>{" "}
          response header. Quote it in support tickets — it&apos;s the index
          we look up in the request log.
        </p>
      </Section>

      <Section id="rate-limits" title="Rate limits">
        <p>Per-key sliding windows, mode-namespaced (live + test separate budgets):</p>
        <ul className="ml-6 list-disc space-y-1 text-sm">
          <li>
            <Code>admin</Code> — 60 req/min, 1,000 req/hour
          </li>
          <li>
            <Code>forms-ingest</Code> — 300 req/min
          </li>
        </ul>
        <p className="mt-3">
          Every response includes <Code>X-RateLimit-Limit</Code>,{" "}
          <Code>X-RateLimit-Remaining</Code>, <Code>X-RateLimit-Reset</Code>.
          A <Code>429</Code> response also sends <Code>Retry-After</Code>.
        </p>
      </Section>

      <Section id="idempotency" title="Idempotency">
        <p>
          Send <Code>Idempotency-Key: &lt;your-key&gt;</Code> on POST / PATCH /
          DELETE. We cache the response for 24 hours; a retry with the same
          key returns the original response without re-executing the
          handler. A retry with the same key but a DIFFERENT body returns{" "}
          <Code>409 idempotency_collision</Code>.
        </p>
        <p className="mt-3">
          Keys are 1–255 characters of <Code>[A-Za-z0-9_-:.]</Code>. UUIDs
          are a good default.
        </p>
      </Section>

      <Section id="contacts" title="Contacts">
        <p>The lead / customer / person record.</p>
        <Endpoint method="GET" path="/v1/contacts" />
        <Endpoint method="POST" path="/v1/contacts" />
        <Endpoint method="GET" path="/v1/contacts/:id" />
        <Endpoint method="PATCH" path="/v1/contacts/:id" />
        <Endpoint method="DELETE" path="/v1/contacts/:id" />
        <H3>Object</H3>
        <Pre>{`{
  "id": "contact_xxx",
  "object": "contact",
  "livemode": true,
  "name": "Acme Corp",
  "email": "hello@acme.com",
  "phone": "+15555550100",
  "company": "Acme",
  "address": "...",
  "source": "website-form",
  "tags": ["hot"],
  "pipeline_stage": null,
  "territory_id": "global",
  "email_opted_out": false,
  "sms_opted_out": false,
  "attribution": null,
  "location": null,
  "created_at": "2026-05-31T10:00:00.000Z",
  "updated_at": "2026-05-31T10:00:00.000Z"
}`}</Pre>
        <H3>List</H3>
        <p>
          Cursor pagination via <Code>starting_after</Code>. Default limit
          20, max 100.
        </p>
        <Pre>{`GET /v1/contacts?limit=50&starting_after=contact_xxx`}</Pre>
      </Section>

      <Section id="deals" title="Deals">
        <Endpoint method="GET" path="/v1/deals" />
        <Endpoint method="POST" path="/v1/deals" />
        <Endpoint method="GET" path="/v1/deals/:id" />
        <Endpoint method="PATCH" path="/v1/deals/:id" />
        <Endpoint method="DELETE" path="/v1/deals/:id" />
        <p>
          Stages: <Code>new</Code>, <Code>contacted</Code>,{" "}
          <Code>qualified</Code>, <Code>proposal</Code>, <Code>won</Code>,{" "}
          <Code>lost</Code>. Priorities: <Code>high</Code>,{" "}
          <Code>medium</Code>, <Code>low</Code>. Filter list by{" "}
          <Code>?stage=...&amp;contact_id=...</Code>.
        </p>
      </Section>

      <Section id="tasks" title="Tasks">
        <Endpoint method="GET" path="/v1/tasks" />
        <Endpoint method="POST" path="/v1/tasks" />
        <Endpoint method="GET" path="/v1/tasks/:id" />
        <Endpoint method="PATCH" path="/v1/tasks/:id" />
        <Endpoint method="DELETE" path="/v1/tasks/:id" />
        <p>
          Filter list by <Code>?completed=true|false</Code> and{" "}
          <Code>?contact_id=...</Code>. Setting <Code>completed: true</Code>{" "}
          stamps <Code>completed_at</Code> and emits{" "}
          <Code>task.completed</Code>.
        </p>
      </Section>

      <Section id="events" title="Events">
        <Endpoint method="GET" path="/v1/events" />
        <Endpoint method="POST" path="/v1/events" />
        <Endpoint method="GET" path="/v1/events/:id" />
        <Endpoint method="PATCH" path="/v1/events/:id" />
        <Endpoint method="DELETE" path="/v1/events/:id" />
        <p>
          Calendar events. <Code>start_at</Code> + <Code>end_at</Code> are
          ISO 8601. <Code>status</Code>: <Code>scheduled</Code>,{" "}
          <Code>awaiting_payment</Code>, <Code>completed</Code>,{" "}
          <Code>cancelled</Code>, <Code>no_show</Code>.
        </p>
      </Section>

      <Section id="forms" title="Forms ingest">
        <Endpoint method="POST" path="/v1/forms/:form_id/submissions" />
        <p>
          The single endpoint with open CORS. Use a key with{" "}
          <Code>forms-ingest</Code> scope (write-only) for browser
          submissions; an <Code>admin</Code> key works too.
        </p>
        <Pre>{`POST /v1/forms/form_xxx/submissions
{
  "values": {
    "field_id_name":  "Acme Corp",
    "field_id_email": "hello@acme.com",
    "field_id_phone": "+15555550100"
  }
}`}</Pre>
        <p>
          The submission creates a Contact, writes a{" "}
          <Code>form_submitted</Code> activity, fires the form&apos;s
          configured automation, and emits the <Code>form.submitted</Code>{" "}
          webhook. Test-mode submissions skip the automation fire so no
          real outbound traffic happens.
        </p>
      </Section>

      <Section id="webhooks" title="Webhooks">
        <p>
          Subscribe to events from <Code>Settings → Webhooks</Code>. Each
          delivery is an HTTP POST to your URL with a signed JSON body.
        </p>
        <H3>Envelope</H3>
        <Pre>{`{
  "id": "evt_xxx",
  "type": "contact.created",
  "api_version": "2026-06-15",
  "created": 1716123456,
  "livemode": true,
  "data": { "contact": { ... } },
  "delivery": { "id": "del_xxx", "attempt": 1 }
}`}</Pre>
        <H3>Signature</H3>
        <p>
          Each request carries{" "}
          <Code>
            LeadStack-Signature: t=&lt;unix_ts&gt;,v1=&lt;hmac_hex&gt;
          </Code>
          . Verify it before trusting the payload.
        </p>
        <Pre>{`// Node.js verification
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, rawBody, header) {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.trim().split("=", 2)),
  );
  const ts = Number(parts.t);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false; // 5-min window
  const expected = createHmac("sha256", secret)
    .update(\`\${ts}.\${rawBody}\`, "utf8")
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(parts.v1),
  );
}`}</Pre>
        <H3>Retries + circuit breaker</H3>
        <p>
          Non-2xx responses (or network failures) retry 3 times at 1m, 5m,
          30m. After 10 consecutive failed deliveries, the subscription
          auto-pauses. Resume it from <Code>Settings → Webhooks</Code>{" "}
          after fixing the upstream.
        </p>
        <H3>Event types</H3>
        <ul className="ml-6 list-disc space-y-0.5 text-sm font-mono">
          <li>contact.created · contact.updated · contact.deleted</li>
          <li>
            deal.created · deal.updated · deal.stage.changed · deal.won ·
            deal.lost
          </li>
          <li>task.created · task.completed</li>
          <li>event.created</li>
          <li>form.submitted</li>
          <li>
            quote.sent · quote.viewed · quote.accepted · quote.declined ·
            quote.paid
          </li>
          <li>booking.created · booking.cancelled</li>
        </ul>
      </Section>

      <footer className="mt-16 border-t pt-6 text-xs text-muted-foreground">
        <p>
          Questions? Reach out from your dashboard. Bug reports + integration
          requests welcome at the support address on the{" "}
          <Link href="/" className="text-primary underline">
            home page
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}

function Toc() {
  return (
    <nav className="mb-10 rounded-2xl border bg-card p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Contents
      </p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <li>
          <a href="#quickstart" className="text-primary hover:underline">
            Quickstart
          </a>
        </li>
        <li>
          <a href="#auth" className="text-primary hover:underline">
            Authentication
          </a>
        </li>
        <li>
          <a href="#versioning" className="text-primary hover:underline">
            Versioning
          </a>
        </li>
        <li>
          <a href="#errors" className="text-primary hover:underline">
            Errors
          </a>
        </li>
        <li>
          <a href="#rate-limits" className="text-primary hover:underline">
            Rate limits
          </a>
        </li>
        <li>
          <a href="#idempotency" className="text-primary hover:underline">
            Idempotency
          </a>
        </li>
        <li>
          <a href="#contacts" className="text-primary hover:underline">
            Contacts
          </a>
        </li>
        <li>
          <a href="#deals" className="text-primary hover:underline">
            Deals
          </a>
        </li>
        <li>
          <a href="#tasks" className="text-primary hover:underline">
            Tasks
          </a>
        </li>
        <li>
          <a href="#events" className="text-primary hover:underline">
            Events
          </a>
        </li>
        <li>
          <a href="#forms" className="text-primary hover:underline">
            Forms ingest
          </a>
        </li>
        <li>
          <a href="#webhooks" className="text-primary hover:underline">
            Webhooks
          </a>
        </li>
      </ul>
    </nav>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 text-base font-semibold tracking-tight">{children}</h3>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Endpoint({ method, path }: { method: string; path: string }) {
  const colour =
    method === "GET"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : method === "POST"
        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400"
        : method === "PATCH"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : method === "DELETE"
            ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
            : "bg-muted text-muted-foreground";
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border bg-background p-2 font-mono text-xs">
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colour}`}
      >
        {method}
      </span>
      <code className="truncate">{path}</code>
    </div>
  );
}

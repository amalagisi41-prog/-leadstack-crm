import "server-only";

/**
 * Twilio Content API wrapper for WhatsApp templates.
 *
 * Twilio is the BSP: we create a Content resource (the template body with
 * positional {{n}} variables), submit it for WhatsApp approval, and poll the
 * approval status. Meta makes the actual approval decision — Twilio relays it.
 *
 * We hit the REST API directly via fetch with Basic auth (the sub-account's
 * own Twilio accountSid + authToken — the same creds used for messaging) so
 * this is independent of the `twilio` SDK version, which has shifted the
 * Content API surface across releases. Errors are thrown as
 * `WhatsappContentError` with the HTTP status + response body for the caller
 * to surface.
 */

const CONTENT_BASE = "https://content.twilio.com/v1";

export class WhatsappContentError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "WhatsappContentError";
    this.status = status;
    this.body = body;
  }
}

function authHeader(accountSid: string, authToken: string): string {
  const token = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${token}`;
}

/** Normalised Twilio/Meta approval state → our WhatsappTemplateStatus values. */
export type ContentApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "paused"
  | "disabled"
  | "unknown";

function normaliseStatus(raw: string | undefined): ContentApprovalStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "received":
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "paused":
      return "paused";
    case "disabled":
      return "disabled";
    default:
      return "unknown";
  }
}

/**
 * Create a Twilio Content resource for a text WhatsApp template. `variables`
 * is the position→sample-value map Meta uses for review (e.g. {"1":"Ben"}).
 * Returns the Content SID (HX…).
 */
export async function createContentTemplate(input: {
  accountSid: string;
  authToken: string;
  friendlyName: string;
  language: string;
  body: string;
  variables: Record<string, string>;
}): Promise<{ contentSid: string }> {
  const res = await fetch(`${CONTENT_BASE}/Content`, {
    method: "POST",
    headers: {
      Authorization: authHeader(input.accountSid, input.authToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      friendly_name: input.friendlyName,
      language: input.language,
      variables: input.variables,
      types: { "twilio/text": { body: input.body } },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new WhatsappContentError(
      "Twilio rejected the content creation",
      res.status,
      text,
    );
  }
  let parsed: { sid?: string };
  try {
    parsed = JSON.parse(text) as { sid?: string };
  } catch {
    throw new WhatsappContentError("Unparseable Content response", res.status, text);
  }
  if (!parsed.sid) {
    throw new WhatsappContentError("Content response missing sid", res.status, text);
  }
  return { contentSid: parsed.sid };
}

/**
 * Submit an existing Content resource for WhatsApp approval. `name` must be
 * lowercase + underscores; `category` is the Meta category.
 */
export async function submitForWhatsappApproval(input: {
  accountSid: string;
  authToken: string;
  contentSid: string;
  name: string;
  category: string;
}): Promise<void> {
  const res = await fetch(
    `${CONTENT_BASE}/Content/${input.contentSid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(input.accountSid, input.authToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: input.name, category: input.category }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new WhatsappContentError(
      "Twilio rejected the approval submission",
      res.status,
      text,
    );
  }
}

/**
 * Fetch the current WhatsApp approval status for a Content resource. Returns
 * the normalised status + any rejection reason Meta supplied.
 */
export async function fetchApprovalStatus(input: {
  accountSid: string;
  authToken: string;
  contentSid: string;
}): Promise<{ status: ContentApprovalStatus; rejectionReason: string | null }> {
  const res = await fetch(
    `${CONTENT_BASE}/Content/${input.contentSid}/ApprovalRequests`,
    {
      method: "GET",
      headers: { Authorization: authHeader(input.accountSid, input.authToken) },
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new WhatsappContentError(
      "Twilio rejected the approval-status fetch",
      res.status,
      text,
    );
  }
  let parsed: {
    whatsapp?: { status?: string; rejection_reason?: string };
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new WhatsappContentError("Unparseable approval response", res.status, text);
  }
  return {
    status: normaliseStatus(parsed.whatsapp?.status),
    rejectionReason: parsed.whatsapp?.rejection_reason ?? null,
  };
}

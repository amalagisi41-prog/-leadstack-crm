import "server-only";

import { Client, Receiver } from "@upstash/qstash";

/**
 * QStash thin wrapper. Two roles:
 *   1. publishCallback() — schedules a future POST against any app path (used
 *      by the workflow engine, broadcasts, social planner, and website poll).
 *   2. verifyQStashSignature() — wraps Upstash's Receiver to validate the
 *      Upstash-Signature header on inbound callback POSTs.
 *
 * If QStash isn't configured (no QSTASH_TOKEN), publishCallback returns null
 * and the caller logs a graceful warning. That keeps local dev workable
 * without live QStash credentials, at the cost of scheduled work not firing.
 */

let _client: Client | null = null;
let _receiver: Receiver | null = null;

function getClient(): Client | null {
  if (!process.env.QSTASH_TOKEN) return null;
  if (!_client) {
    // QSTASH_URL is region-specific (eu-central-1.upstash.io vs
    // us-east-1.upstash.io). The SDK default may not match the token's
    // region, so we pass it explicitly when set.
    const baseUrl = process.env.QSTASH_URL;
    _client = new Client({
      token: process.env.QSTASH_TOKEN,
      ...(baseUrl ? { baseUrl } : {}),
    });
  }
  return _client;
}

function getReceiver(): Receiver | null {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) return null;
  if (!_receiver) {
    _receiver = new Receiver({
      currentSigningKey: current,
      nextSigningKey: next,
    });
  }
  return _receiver;
}

export function qstashIsConfigured(): boolean {
  return !!getClient() && !!getReceiver();
}

interface PublishCallbackInput {
  /** Path on our app, e.g. "/api/automations/step" — gets appended to NEXT_PUBLIC_APP_URL. */
  pathname: string;
  /** Body POSTed to the callback. */
  body: Record<string, unknown>;
  /** Seconds to defer before the callback fires. 0 = fire immediately. */
  delaySeconds: number;
  /** QStash dedup id — underscores only, no colons. Reschedules pass a nonce-suffixed id. */
  deduplicationId: string;
}

interface PublishCallbackResult {
  messageId: string;
}

/**
 * Generic QStash publish helper — schedules a POST against any path on our
 * app. Used by the workflow engine, broadcasts, social planner, and the
 * website poll loop.
 *
 * Returns null if QStash isn't configured or the publish failed; callers
 * decide what to do (typically: mark the work item failed).
 */
export async function publishCallback(
  input: PublishCallbackInput,
): Promise<PublishCallbackResult | null> {
  const client = getClient();
  if (!client) return null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    console.error("[qstash] NEXT_PUBLIC_APP_URL not set");
    return null;
  }

  try {
    const res = await client.publishJSON({
      url: `${baseUrl}${input.pathname}`,
      body: input.body,
      delay: Math.max(0, Math.floor(input.delaySeconds)),
      deduplicationId: input.deduplicationId,
    });
    return { messageId: res.messageId };
  } catch (err) {
    console.error("[qstash] publishCallback failed", err);
    return null;
  }
}

interface PublishSocialPostInput {
  postId: string;
  subAccountId: string;
  /** Seconds to defer before publishing. 0 = publish immediately. */
  delaySeconds: number;
}

/**
 * Schedule a Social Planner post to publish at its scheduled time. Thin
 * wrapper over publishCallback against /api/social/publish/step. The dedup id
 * is namespaced (`social_<postId>`) so it can't collide with automation /
 * broadcast dedup ids, and a re-publish of the same post collapses inside the
 * dedup window.
 */
export async function publishSocialPost(
  input: PublishSocialPostInput,
): Promise<PublishCallbackResult | null> {
  return publishCallback({
    pathname: "/api/social/publish/step",
    body: { postId: input.postId, subAccountId: input.subAccountId },
    delaySeconds: input.delaySeconds,
    deduplicationId: `social_${input.postId}`,
  });
}

/**
 * Verify an inbound QStash callback's signature. Returns true if the body
 * matches the Upstash-Signature header.
 */
export async function verifyQStashSignature(
  signature: string,
  body: string,
): Promise<boolean> {
  const receiver = getReceiver();
  if (!receiver) return false;
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}

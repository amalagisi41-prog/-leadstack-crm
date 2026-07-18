import { describe, it, expect } from "vitest";
import { METHOD_TEMPLATES } from "@templates/index";
import {
  compileGuardedSend,
  checkFairHousing,
  INBOUND_INITIATED_TRIGGER_TYPES,
} from "./guardrails";
import { isSendGatedNodeType } from "./send-window";
import type { WorkflowNode } from "@/types/workflows";

/**
 * Lead-runner harness (Phase 1 spec, STEP 4): exercises every Method
 * Template's REAL node graph — not a synthetic example — against the
 * shared guardrail compiler with representative fake leads. Runs as a
 * normal vitest file, so it's part of `pnpm test` and therefore the CI
 * gate (.github/workflows/ci.yml) on every push and PR.
 *
 * What it proves for each of the four templates:
 *   1. It has at least one contact-facing send step (not a dead template).
 *   2. Every send node's own copy is Fair-Housing-clean as shipped.
 *   3. A legitimate, unremarkable lead sails through with no false blocks.
 *   4. For inbound-initiated templates (the lead reached out first): an
 *      escalation-keyword lead blocks the automated reply; the first send
 *      is exempt from quiet hours but every later send in the same run
 *      is not.
 *   5. For outbound-initiated templates: every send respects quiet hours
 *      unconditionally (no inbound exemption applies).
 */

const DEFAULT_ESCALATION_KEYWORDS = ["complaint", "refund", "stop ai", "speak to manager"];
const QUIET_WINDOW = { startHour: 9, endHour: 18, timezone: "UTC" };
const NIGHT = new Date("2026-07-14T04:00:00Z"); // 4am UTC — outside the window
const DAY = new Date("2026-07-14T12:00:00Z"); // noon UTC — inside the window

const LEGIT_LEAD_MESSAGE =
  "Hi, I'm interested in a 3-bedroom home near downtown, budget around $450k. Can someone help me look at options?";
const ESCALATION_LEAD_MESSAGE =
  "I want to file a complaint about how I was treated on my last call.";

/** Raw editable text for a node, or null if the node type carries none
 *  (whatsapp_template / google_review_request — content lives elsewhere,
 *  same reasoning as engine.ts's guardedMessageBody). Mirrors which node
 *  types are actually guardrail-gated, via isSendGatedNodeType. */
function sendGatedBody(node: WorkflowNode): string | null {
  if (!isSendGatedNodeType(node.type)) return null;
  if (node.type === "send_email") {
    const cfg = node.config as { subject?: string; body?: string };
    return `${cfg.subject ?? ""} ${cfg.body ?? ""}`;
  }
  if (node.type === "send_sms") {
    return (node.config as { body?: string }).body ?? "";
  }
  // whatsapp_template / google_review_request: still guardrail-gated
  // (quiet hours + escalation) but carry no in-node text to Fair-Housing-scan.
  return "";
}

/** Walk every node reachable from startNodeId — linear `next` chains plus
 *  if_else branches — in a stable, deterministic order. All four shipped
 *  templates are linear, but this doesn't assume that. */
function walkNodes(
  nodes: Record<string, WorkflowNode>,
  startNodeId: string | null,
): WorkflowNode[] {
  const visited: WorkflowNode[] = [];
  const seen = new Set<string>();
  const queue: string[] = startNodeId ? [startNodeId] : [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes[id];
    if (!node) continue;
    visited.push(node);
    if (node.next) queue.push(node.next);
    if (node.branches?.whenTrue) queue.push(node.branches.whenTrue);
    if (node.branches?.whenFalse) queue.push(node.branches.whenFalse);
  }
  return visited;
}

describe("lead-runner: Method Template Library", () => {
  it("ships exactly the four canonical templates", () => {
    expect(METHOD_TEMPLATES.map((t) => t.key)).toEqual([
      "missed-call-textback",
      "new-lead-instant-response",
      "post-closing-review-request",
      "cold-lead-90-day-revival",
    ]);
  });

  for (const template of METHOD_TEMPLATES) {
    describe(template.displayName, () => {
      const seed = template.seed();
      const nodes = walkNodes(seed.nodes, seed.startNodeId);
      const isInboundInitiated = INBOUND_INITIATED_TRIGGER_TYPES.has(
        seed.trigger.type,
      );
      const sendNodes = nodes.filter((n) => sendGatedBody(n) !== null);

      it("has at least one contact-facing send step", () => {
        expect(sendNodes.length).toBeGreaterThan(0);
      });

      it("ships Fair-Housing-clean copy on every send node with editable text", () => {
        for (const node of sendNodes) {
          const body = sendGatedBody(node) ?? "";
          if (!body) continue; // whatsapp_template / google_review_request: nothing to scan
          const result = checkFairHousing(body);
          expect(
            result.blocked,
            `${node.id} (${node.type}): matched [${result.matchedPhrases.join(", ")}]`,
          ).toBe(false);
        }
      });

      it("a legitimate lead with no escalation signal reaches every send node", () => {
        sendNodes.forEach((node, index) => {
          const isFirstNode = index === 0;
          const outcome = compileGuardedSend({
            messageBody: sendGatedBody(node) ?? "",
            sendWindow: null, // no window configured anywhere — fails open
            isInboundTriggered: isFirstNode && isInboundInitiated,
            escalationKeywords: DEFAULT_ESCALATION_KEYWORDS,
            lastInboundMessage: LEGIT_LEAD_MESSAGE,
            now: DAY,
          });
          expect(outcome.allowed, `${node.id}: ${JSON.stringify(outcome)}`).toBe(
            true,
          );
        });
      });

      if (isInboundInitiated) {
        it("an escalation-keyword lead blocks the first automated reply", () => {
          const [firstSendNode] = sendNodes;
          const outcome = compileGuardedSend({
            messageBody: sendGatedBody(firstSendNode) ?? "",
            sendWindow: null,
            isInboundTriggered: true,
            escalationKeywords: DEFAULT_ESCALATION_KEYWORDS,
            lastInboundMessage: ESCALATION_LEAD_MESSAGE,
            now: DAY,
          });
          expect(outcome.allowed).toBe(false);
          if (!outcome.allowed) expect(outcome.reason).toBe("escalation");
        });

        it("the first send is exempt from quiet hours; every later send is still gated", () => {
          const [firstSendNode, ...laterSendNodes] = sendNodes;

          const firstOutcome = compileGuardedSend({
            messageBody: sendGatedBody(firstSendNode) ?? "",
            sendWindow: QUIET_WINDOW,
            isInboundTriggered: true,
            escalationKeywords: DEFAULT_ESCALATION_KEYWORDS,
            lastInboundMessage: null,
            now: NIGHT,
          });
          expect(firstOutcome.allowed).toBe(true);

          for (const node of laterSendNodes) {
            const outcome = compileGuardedSend({
              messageBody: sendGatedBody(node) ?? "",
              sendWindow: QUIET_WINDOW,
              isInboundTriggered: false,
              escalationKeywords: DEFAULT_ESCALATION_KEYWORDS,
              lastInboundMessage: null,
              now: NIGHT,
            });
            expect(outcome.allowed, node.id).toBe(false);
            if (!outcome.allowed) expect(outcome.reason).toBe("quiet_hours");
          }
        });
      } else {
        it("every send is outbound-initiated and always respects quiet hours", () => {
          for (const node of sendNodes) {
            const outcome = compileGuardedSend({
              messageBody: sendGatedBody(node) ?? "",
              sendWindow: QUIET_WINDOW,
              isInboundTriggered: false,
              escalationKeywords: DEFAULT_ESCALATION_KEYWORDS,
              lastInboundMessage: null,
              now: NIGHT,
            });
            expect(outcome.allowed, node.id).toBe(false);
            if (!outcome.allowed) expect(outcome.reason).toBe("quiet_hours");
          }
        });
      }
    });
  }
});

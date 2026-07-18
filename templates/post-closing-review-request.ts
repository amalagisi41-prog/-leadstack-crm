import type { MethodTemplateDefinition } from "./types";

/**
 * post-closing → review request → GBP link
 *
 * Fires when a Won deal is FIRST marked completed (`deal.completed`, from
 * PATCH /api/deals/[id]). The `google_review_request` node delegates to the
 * real, already-shipped Google Review Requests feature
 * (src/lib/reviews/request.ts::maybeSendReviewRequest) instead of sending a
 * canned message with a placeholder link — it reuses whatever review URL,
 * channel, and cooldown the operator configured under Settings → Google
 * reviews. Until that link is set up, this step is simply a no-op — the
 * template doesn't nag the operator or the customer.
 *
 * This supersedes the old one-off review-request behavior that used to live
 * directly in the deals route handler.
 */
export const postClosingReviewRequest: MethodTemplateDefinition = {
  key: "post-closing-review-request",
  version: 1,
  displayName: "Post-Closing → Review Request",
  description:
    "A deal is marked completed → a few days later, ask for a Google review using your configured review link. No-op until you set that link up in Settings → Google reviews.",
  seed: () => ({
    trigger: { type: "deal.completed", filters: { all: [] } },
    nodes: {
      n1: {
        id: "n1",
        type: "wait",
        config: { seconds: 3 * 86_400 },
        next: "n2",
      },
      n2: {
        id: "n2",
        type: "google_review_request",
        config: {},
        next: null,
      },
    },
    startNodeId: "n1",
  }),
};

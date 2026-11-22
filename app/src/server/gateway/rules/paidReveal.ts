import type { Rule } from "./types";

/**
 * `paid_reveal` (added in WP1 at person-2's request, WP2 step 3): revealing a work email spends
 * provider credits, so on PREPARE and ACT goals it runs only after approval. WATCH goals are
 * already denied by autonomy_watch.
 */
export const paidReveal: Rule = {
  id: "paid_reveal",
  kind: "approval",
  check({ request }) {
    return request.actionType === "contact.reveal_email" ? "revealing a work email spends provider credits" : null;
  },
};

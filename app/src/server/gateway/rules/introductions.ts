import type { Rule } from "./types";

/**
 * §8 `introductions`: revealing identity on a card match needs approval. Each side calls
 * card.reveal as itself, so each side gets its own Approval.
 */
export const introductions: Rule = {
  id: "introductions",
  kind: "approval",
  check({ request }) {
    return request.actionType === "card.reveal" ? "identity reveal needs this side's approval" : null;
  },
};

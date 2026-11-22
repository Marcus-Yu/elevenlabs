import type { Rule } from "./types";

const CONTACT_ACTIONS = new Set(["contact.reveal_email", "outreach.send"]);

/**
 * §8 `opt_in_only` (scope change, 2026-11-22): on a `hire` goal, and for any person found by
 * research for a hire goal, Atlas never reveals an email or sends outreach. People are contacted
 * only through a double-opt-in `card.reveal` introduction.
 */
export const optInOnly: Rule = {
  id: "opt_in_only",
  kind: "deny",
  check({ request, goal, researchedPerson }) {
    if (!CONTACT_ACTIONS.has(request.actionType)) return null;
    if (goal?.kind === "hire") return `${request.actionType} is not used on hire goals; people are contacted only through a double-opt-in card.reveal introduction`;
    if (researchedPerson) return "this person was found by research for a hire goal; contact them only through a double-opt-in card.reveal introduction";
    return null;
  },
};

import { INDIVIDUAL_GOAL_KINDS } from "./actionGroups";
import type { Rule } from "./types";

/** §8 `individuals`: no contact search for goals that seek private individuals. */
export const individuals: Rule = {
  id: "individuals",
  kind: "deny",
  check({ request, goal }) {
    if (request.actionType !== "contact.search" || !goal || !INDIVIDUAL_GOAL_KINDS.has(goal.kind)) return null;
    return `contact.search is not used for ${goal.kind} goals; use opt-in channels instead (jobs.search, share cards)`;
  },
};

import type { FactSnapshot } from "../store";
import type { Rule } from "./types";

/**
 * Purpose vocabulary: the action type (e.g. "draft.create") for gateway actions, or
 * "model:<name>" for model calls made outside the gateway. ProfileFact.allowedPurposes lists them.
 * Returns the reason a set of facts may not be used for `purpose`, or null.
 */
export function checkNeedToKnow(facts: FactSnapshot[], factIds: string[], purpose: string): string | null {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  for (const factId of factIds) {
    const fact = byId.get(factId);
    if (!fact) return `fact ${factId} is not one of the user's profile facts`;
    if (!fact.allowedPurposes.includes(purpose)) return `fact "${fact.key}" is not allowed for ${purpose}`;
  }
  return null;
}

/** §8 `need_to_know`: every fact handed to a model must allow this purpose. */
export const needToKnow: Rule = {
  id: "need_to_know",
  kind: "deny",
  check({ request, facts, usedFactIds }) {
    if (usedFactIds.length === 0) return null;
    return checkNeedToKnow(facts, usedFactIds, request.actionType);
  },
};

import type { Rule } from "./types";

/**
 * §8 `preference_confirm` (team notes): a preference written by anyone but the user (for example
 * inferred from a rejection) is held for the user's confirmation. The confirmed write runs with
 * the user as actor. One rejection never silently becomes a permanent preference.
 */
export const preferenceConfirm: Rule = {
  id: "preference_confirm",
  kind: "approval",
  check({ request }) {
    if (request.actionType !== "memory.write" || request.actor.kind === "user") return null;
    return (request.payload as { kind?: unknown }).kind === "preference" ? "preference proposed by an agent needs the user's confirmation" : null;
  },
};

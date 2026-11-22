import { ACTION_CONSENT } from "./actionGroups";
import type { Rule } from "./types";

/** §8 `consent`: actions that listen, call, share or hand profile facts to a model need an active Consent. */
export const consent: Rule = {
  id: "consent",
  kind: "deny",
  check({ request, consents, usedFactIds }) {
    const required = ACTION_CONSENT[request.actionType];
    if (required && !consents.has(required)) return `missing active consent: ${required}`;
    if (usedFactIds.length > 0 && !consents.has("model_processing")) return "missing active consent: model_processing";
    return null;
  },
};

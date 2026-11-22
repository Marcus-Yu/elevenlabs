import { factAppearsIn, prepareText } from "./factMatch";
import type { Rule } from "./types";

/**
 * §8 `provider_minimum` (team notes): a request bound for a provider or a remote agent carries only
 * the minimum query. It may not contain a private fact's value, or any fact whose allowedPurposes
 * exclude this action, in any format. `providerText` is every string in the payload of a
 * provider-bound action or a watcher request.
 */
export const providerMinimum: Rule = {
  id: "provider_minimum",
  kind: "deny",
  check({ request, facts, providerText }) {
    if (providerText.length === 0) return null;
    const prepared = prepareText(providerText);
    for (const fact of facts) {
      const excluded = fact.sensitivity === "private" || !fact.allowedPurposes.includes(request.actionType);
      if (excluded && factAppearsIn(fact, prepared)) {
        return `${request.actionType} payload contains the ${fact.sensitivity} fact "${fact.key}", which is not allowed for this purpose`;
      }
    }
    return null;
  },
};

import type { Rule } from "./types";

/** §8 `personalization`: a send needs a draft personalised from sources that belong to its match. */
export const personalization: Rule = {
  id: "personalization",
  kind: "deny",
  check({ request, draft }) {
    if (request.actionType !== "outreach.send" || !draft) return null;
    if (draft.personalizationRefs.length === 0) return "draft has no personalization refs";
    const own = new Set(draft.refs.filter((ref) => ref.matchId === draft.matchId).map((ref) => ref.id));
    const foreign = draft.personalizationRefs.filter((refId) => !own.has(refId));
    return foreign.length > 0 ? `personalization refs do not belong to this match: ${foreign.join(", ")}` : null;
  },
};

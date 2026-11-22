import type { Rule } from "./types";

/** §8 `tainted_draft`: a send whose draft cites web-sourced evidence needs approval. */
export const taintedDraft: Rule = {
  id: "tainted_draft",
  kind: "approval",
  check({ request, draft }) {
    if (request.actionType !== "outreach.send" || !draft) return null;
    return draft.refs.some((ref) => ref.provider === "web") ? "draft cites web-sourced evidence" : null;
  },
};

import type { Rule } from "./types";

/** §8 `first_contact`: the first send to a recipient always needs approval. */
export const firstContact: Rule = {
  id: "first_contact",
  kind: "approval",
  check({ request, recipient, priorApprovedSend }) {
    if (request.actionType !== "outreach.send" || !recipient || priorApprovedSend) return null;
    return `first contact with ${recipient}`;
  },
};

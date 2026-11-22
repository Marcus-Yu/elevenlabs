import type { Rule } from "./types";

/** §8 `autonomy_watch`: a WATCH goal can look but never send or pay to reveal an email. */
export const autonomyWatch: Rule = {
  id: "autonomy_watch",
  kind: "deny",
  check({ request, goal }) {
    if (goal?.autonomy !== "WATCH") return null;
    if (request.actionType !== "outreach.send" && request.actionType !== "contact.reveal_email") return null;
    return `${request.actionType} is not allowed on a WATCH goal`;
  },
};

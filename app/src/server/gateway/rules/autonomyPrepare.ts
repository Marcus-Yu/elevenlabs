import type { Rule } from "./types";

/** §8 `autonomy_prepare`: on a PREPARE goal every send needs approval. */
export const autonomyPrepare: Rule = {
  id: "autonomy_prepare",
  kind: "approval",
  check({ request, goal }) {
    return request.actionType === "outreach.send" && goal?.autonomy === "PREPARE" ? "goal autonomy is PREPARE" : null;
  },
};

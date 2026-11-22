import { GOAL_REQUIRED } from "./actionGroups";
import type { Rule } from "./types";

/** §8 `ownership`: the goal (and any draft or match named in the payload) must exist, be active and belong to the user. */
export const ownership: Rule = {
  id: "ownership",
  kind: "deny",
  check({ request, goal, draft, match }) {
    const { actionType, goalId, userId } = request;
    if (!goalId) return GOAL_REQUIRED.has(actionType) ? `${actionType} requires a goalId` : null;
    if (!goal || goal.userId !== userId) return "goal not found for this user";
    if (goal.status !== "ACTIVE") return `goal is ${goal.status}`;
    if (actionType === "outreach.send" && (!draft || draft.goalId !== goal.id)) return "draft not found for this goal";
    if (actionType === "draft.create" && (!match || match.goalId !== goal.id)) return "match not found for this goal";
    return null;
  },
};

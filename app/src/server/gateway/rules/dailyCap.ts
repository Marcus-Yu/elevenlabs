import { DEFAULT_DAILY_CAP } from "./actionGroups";
import type { Rule } from "./types";

export function dailyCapOf(rules: unknown): number {
  const cap = (rules as { dailyCap?: unknown } | null)?.dailyCap;
  return typeof cap === "number" && Number.isInteger(cap) && cap >= 0 ? cap : DEFAULT_DAILY_CAP;
}

/** §8 `daily_cap`: at most rules.dailyCap sends per goal per UTC day (default 10). */
export const dailyCap: Rule = {
  id: "daily_cap",
  kind: "deny",
  check({ request, goal, sendsToday }) {
    if (request.actionType !== "outreach.send" || !goal) return null;
    const cap = dailyCapOf(goal.rules);
    return sendsToday >= cap ? `daily send cap reached (${sendsToday}/${cap})` : null;
  },
};

import type { ActionRequest, ActionType } from "../../../shared/contracts";
import type { RuleInput } from "../rules/types";
import type { GoalSnapshot } from "../store";

export const BUDGET_FACT = {
  id: "fact_budget",
  key: "manufacturing_budget_ceiling",
  value: "$180,000",
  sensitivity: "private" as const,
  allowedPurposes: [],
};

/** A RuleInput where every rule passes; override fields to make one fire. */
export function ruleInput(
  actionType: ActionType,
  overrides: Omit<Partial<RuleInput>, "request" | "goal"> & { request?: Partial<ActionRequest>; goal?: Partial<GoalSnapshot> | null } = {},
): RuleInput {
  const { request, goal, ...rest } = overrides;
  return {
    request: {
      actionType,
      userId: "user_1",
      goalId: "goal_1",
      actor: { kind: "agent", id: "thread" },
      origin: "thread",
      tainted: false,
      payload: {},
      ...request,
    },
    phase: "request",
    goal:
      goal === null
        ? null
        : { id: "goal_1", userId: "user_1", status: "ACTIVE", kind: "customers", autonomy: "ACT", rules: {}, ...goal },
    user: null,
    consents: new Set(),
    facts: [],
    usedFactIds: [],
    outgoingText: [],
    providerText: [],
    recipient: null,
    recipientOptedOut: false,
    draft: null,
    match: null,
    revealMatch: null,
    researchedPerson: false,
    strippedFields: [],
    sendsToday: 0,
    priorApprovedSend: true,
    env: { outreachMode: "sandbox", redirectTo: "sandbox@atlas.example", adapterMode: "replay" },
    ...rest,
  };
}

export function sendDraft(overrides: Partial<NonNullable<RuleInput["draft"]>> = {}): NonNullable<RuleInput["draft"]> {
  return {
    id: "draft_1",
    matchId: "match_1",
    goalId: "goal_1",
    version: 1,
    personalizationRefs: ["ref_1"],
    refs: [{ id: "ref_1", matchId: "match_1", provider: "fiber" }],
    ...overrides,
  };
}

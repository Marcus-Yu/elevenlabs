import type { ActionRequest, ActionType } from "../../../shared/contracts";
import { createGateway, type Gateway } from "../engine";
import { createStubHandlers } from "../handlers/stubs";
import { createRegistry } from "../registry";
import type { GatewayEnv } from "../rules/types";
import type { Autonomy } from "../store";
import type { HandlerMap } from "../types";
import { MemoryGatewayStore } from "./memoryStore";

export const NOW = new Date("2026-11-22T15:00:00.000Z");
export const USER = "user_1";
export const OTHER_USER = "user_2";
export const GOAL = "goal_1";
export const MATCH = "match_1";
export const DRAFT = "draft_1";
export const REF = "ref_1";
export const RECIPIENT = "ops@customer.example";
export const REDIRECT = "sandbox@atlas.example";

/** A seeded in-memory world: one ACTIVE goal, a match with a sourced draft and the WP0 seed's facts. */
export function createWorld(options: { autonomy?: Autonomy; env?: Partial<GatewayEnv>; handlers?: HandlerMap } = {}) {
  let now = NOW;
  const store = new MemoryGatewayStore(() => now);
  store.goals.set(GOAL, { id: GOAL, userId: USER, status: "ACTIVE", kind: "customers", autonomy: options.autonomy ?? "PREPARE", rules: {} });
  store.matches.set(MATCH, { id: MATCH, goalId: GOAL, status: "APPROVED", domain: "customer.example" });
  store.sourceRefs.set(REF, { id: REF, matchId: MATCH, provider: "fiber" });
  store.drafts.set(DRAFT, { id: DRAFT, matchId: MATCH, goalId: GOAL, version: 1, personalizationRefs: [REF] });
  store.consents.set(USER, ["model_processing"]);
  store.facts.set(USER, [
    { id: "fact_product", key: "product", value: "Autonomous gripper for warehouse picking", sensitivity: "public", allowedPurposes: ["draft.create"] },
    { id: "fact_spec", key: "gripper_housing_spec", value: "6061 aluminium housing, 2 mm wall", sensitivity: "shareable", allowedPurposes: ["draft.create"] },
    { id: "fact_budget", key: "manufacturing_budget_ceiling", value: "$180,000", sensitivity: "private", allowedPurposes: [] },
  ]);
  const env: GatewayEnv = { outreachMode: "sandbox", redirectTo: REDIRECT, adapterMode: "replay", ...options.env };
  const registry = createRegistry({ ...createStubHandlers(), ...options.handlers });
  const inner = createGateway({ store, registry, env, now: () => now });
  // Counts gateway calls so tests can assert one ActionLog row per call.
  const counter = { calls: 0 };
  const gateway: Gateway = {
    execute: (req) => (counter.calls++, inner.execute(req)),
    decideApproval: (input) => (counter.calls++, inner.decideApproval(input)),
  };
  const world = {
    store,
    gateway,
    get calls() {
      return counter.calls;
    },
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
  lastWorld = world;
  return world;
}

let lastWorld: ReturnType<typeof createWorld> | null = null;

/** The most recently created world, for table tests whose scenarios build their own. */
export function latestWorld(): ReturnType<typeof createWorld> {
  if (!lastWorld) throw new Error("no world created yet");
  return lastWorld;
}

export function request(actionType: ActionType, payload: unknown, overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    actionType,
    userId: USER,
    goalId: GOAL,
    actor: { kind: "agent", id: "thread" },
    origin: "thread",
    tainted: false,
    payload,
    ...overrides,
  };
}

export function sendPayload(overrides: Record<string, unknown> = {}) {
  return { draftId: DRAFT, to: RECIPIENT, subject: "Gripper pilot", body: "Saw your new Reno site; our gripper picks mixed totes.", ...overrides };
}

export function draftPayload(overrides: Record<string, unknown> = {}) {
  return {
    matchId: MATCH,
    subject: "Quote request",
    body: "We need 500 housings in 6061 aluminium, 2 mm wall.",
    personalizationRefs: [REF],
    usedFactIds: ["fact_spec"],
    ...overrides,
  };
}

import { createHash } from "node:crypto";
import { z } from "zod";
import type { ActionRequest, GatewayResult } from "../../shared/contracts";
import {
  applyCriteriaChange,
  candidateQueryFor,
  evaluateShortlist,
  HireCriteria,
  proposeCriteriaChange,
  rankCandidates,
  type Candidate,
  type CriteriaChange,
  type RankedCandidate,
} from "./candidates";

// The hiring flow behind the Wasp operations (createHireGoal, runHireShortlist, rejectMatchWithReason,
// confirmCriteriaChange). Framework-free: operations.ts passes the Goal delegate and gateway.execute.
//
// State lives on Goal.icp (JSON), so no schema change was needed before the freeze:
//   { hireCriteria, pool, rejected[], pendingChange, runs[] }
// Searches go through gateway.execute (contact.search in criteria mode). The rerun re-ranks the
// recorded pool under the confirmed criteria, so it works in replay; it does not search again.

export interface HireGoalRow {
  id: string;
  userId: string;
  kind: string;
  statement: string;
  icp: unknown;
}

export interface HireDeps {
  execute(req: ActionRequest): Promise<GatewayResult>;
  createGoal(data: { userId: string; kind: "hire"; direction: "BUY"; statement: string; icp: HireState; autonomy: "PREPARE" }): Promise<{ id: string }>;
  findGoal(userId: string, goalId: string): Promise<HireGoalRow | null>;
  saveState(goalId: string, state: HireState): Promise<void>;
}

export type HireRun = {
  at: string;
  criteria: HireCriteria;
  topK: string[];
  evaluation: { k: number; fitAtK: number; meanScore: number };
  /** Set on a rerun: the earlier run judged by the same (new) criteria. */
  comparedTo?: { k: number; fitAtK: number; meanScore: number };
};

export interface HireState {
  hireCriteria: HireCriteria;
  pool?: Candidate[];
  rejected?: { key: string; fullName: string; reason: string; at: string }[];
  pendingChange?: CriteriaChange & { candidateKey: string };
  runs?: HireRun[];
}

/** What the thread renders. `matchId` is stable per goal and candidate. */
export type HireShortlistEntry = RankedCandidate & { matchId: string };

export class HireFlowError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "HireFlowError";
  }
}

const candidateKey = (c: Candidate) => c.linkedinUrl ?? c.fullName;
const matchIdFor = (goalId: string, c: Candidate) => `${goalId}:${createHash("sha256").update(candidateKey(c)).digest("hex").slice(0, 12)}`;

function stateOf(goal: HireGoalRow): HireState {
  if (goal.kind !== "hire") throw new HireFlowError(400, "not a hire goal");
  const icp = (goal.icp ?? {}) as Partial<HireState>;
  const criteria = HireCriteria.safeParse(icp.hireCriteria);
  if (!criteria.success) throw new HireFlowError(400, "goal has no approved hiring criteria");
  return { ...icp, hireCriteria: criteria.data } as HireState;
}

async function loadGoal(deps: HireDeps, userId: string, goalId: string) {
  const goal = await deps.findGoal(userId, goalId);
  if (!goal) throw new HireFlowError(404, "goal not found");
  return { goal, state: stateOf(goal) };
}

function rankWithIds(goalId: string, state: HireState, criteria: HireCriteria): HireShortlistEntry[] {
  return rankCandidates({ candidates: state.pool ?? [], criteria, rejectedUrls: (state.rejected ?? []).map((r) => r.key) }).map((r) => ({ ...r, matchId: matchIdFor(goalId, r.candidate) }));
}

// ---------- operations ----------

export async function createHireGoal(userId: string, rawCriteria: unknown, deps: HireDeps): Promise<{ goalId: string }> {
  const parsed = HireCriteria.safeParse(rawCriteria);
  if (!parsed.success) throw new HireFlowError(400, `criteria: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const goal = await deps.createGoal({ userId, kind: "hire", direction: "BUY", statement: `Hire a ${parsed.data.role}`, icp: { hireCriteria: parsed.data }, autonomy: "PREPARE" });
  return { goalId: goal.id };
}

export async function runHireShortlist(userId: string, goalId: string, deps: HireDeps, now = new Date()): Promise<HireShortlistEntry[]> {
  const { state } = await loadGoal(deps, userId, goalId);
  const result = await deps.execute({
    actionType: "contact.search",
    userId,
    goalId,
    actor: { kind: "user", id: userId },
    origin: "ui",
    tainted: false,
    payload: { mode: "criteria", ...candidateQueryFor(state.hireCriteria) },
  });
  if (result.decision.outcome !== "allow") {
    throw new HireFlowError(403, `contact.search ${result.decision.outcome}: ${"reason" in result.decision ? result.decision.reason : result.decision.ruleId}`);
  }
  const pool = ((result.data as { candidates?: Candidate[] } | undefined)?.candidates ?? []).map(({ ...c }) => {
    delete (c as { email?: string }).email;
    return c;
  });
  const next: HireState = { ...state, pool };
  const ranked = rankWithIds(goalId, next, state.hireCriteria);
  next.runs = [...(state.runs ?? []), { at: now.toISOString(), criteria: state.hireCriteria, topK: ranked.slice(0, 5).map((r) => r.matchId), evaluation: evaluateShortlist(ranked, state.hireCriteria) }];
  await deps.saveState(goalId, next);
  return ranked;
}

export async function rejectMatchWithReason(userId: string, matchId: string, reason: string, deps: HireDeps, now = new Date()): Promise<{ proposedChange: CriteriaChange | null }> {
  const goalId = matchId.split(":")[0] ?? "";
  const { state } = await loadGoal(deps, userId, goalId);
  const candidate = (state.pool ?? []).find((c) => matchIdFor(goalId, c) === matchId);
  if (!candidate) throw new HireFlowError(404, "match not found");
  const trimmed = z.string().trim().min(2).max(300).parse(reason);

  const proposedChange = proposeCriteriaChange(state.hireCriteria, candidate, trimmed);
  const next: HireState = {
    ...state,
    rejected: [...(state.rejected ?? []).filter((r) => r.key !== candidateKey(candidate)), { key: candidateKey(candidate), fullName: candidate.fullName, reason: trimmed, at: now.toISOString() }],
    ...(proposedChange ? { pendingChange: { ...proposedChange, candidateKey: candidateKey(candidate) } } : {}),
  };
  if (!proposedChange) delete next.pendingChange;
  await deps.saveState(goalId, next);

  // The rejection is a goal preference (WP12). Through the gateway, so it is logged like everything else.
  await deps.execute({
    actionType: "memory.write",
    userId,
    goalId,
    actor: { kind: "user", id: userId },
    origin: "ui",
    tainted: false,
    payload: { kind: "preference", text: `Rejected a ${candidate.title || "candidate"} (${candidate.yearsExperience ?? "?"} yrs): ${trimmed}`.slice(0, 500), source: `hire-shortlist:${matchId}` },
  });
  return { proposedChange };
}

// Postgres jsonb reorders object keys, so compare the fields, not the raw JSON text.
const changeKey = (changes: unknown) =>
  JSON.stringify((Array.isArray(changes) ? changes : []).map((c: { field?: unknown; from?: unknown; to?: unknown }) => [c?.field, c?.from ?? null, c?.to ?? null]));

/**
 * preference_confirm: applies the change the server proposed (not whatever the client sends), then
 * re-ranks the pool. The previous run is judged by the new criteria too, for the TraceRoot comparison.
 */
export async function confirmCriteriaChange(userId: string, goalId: string, proposedChange: unknown, deps: HireDeps, now = new Date()): Promise<HireShortlistEntry[]> {
  const { state } = await loadGoal(deps, userId, goalId);
  const pending = state.pendingChange;
  if (!pending) throw new HireFlowError(409, "no criteria change is waiting for confirmation");
  const sent = (proposedChange ?? {}) as { changes?: unknown };
  if (changeKey(sent.changes) !== changeKey(pending.changes)) throw new HireFlowError(409, "the confirmed change does not match the proposed change");

  const confirmed = applyCriteriaChange(state.hireCriteria, pending);
  const ranked = rankWithIds(goalId, state, confirmed);
  const before = rankWithIds(goalId, state, state.hireCriteria);
  const next: HireState = { ...state, hireCriteria: confirmed };
  delete next.pendingChange;
  next.runs = [
    ...(state.runs ?? []),
    { at: now.toISOString(), criteria: confirmed, topK: ranked.slice(0, 5).map((r) => r.matchId), evaluation: evaluateShortlist(ranked, confirmed), comparedTo: evaluateShortlist(before, confirmed) },
  ];
  await deps.saveState(goalId, next);
  return ranked;
}

export async function getHireRuns(userId: string, goalId: string, deps: HireDeps): Promise<HireRun[]> {
  const { state } = await loadGoal(deps, userId, goalId);
  return state.runs ?? [];
}

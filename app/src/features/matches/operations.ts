import { HttpError } from "wasp/server";
import type { ConfirmCriteriaChange, CreateHireGoal, GetHireRuns, RejectMatchWithReason, RunHireShortlist } from "wasp/server/operations";
import type { ActionRequest, GatewayResult } from "../../shared/contracts";
import { gateway } from "../../server/gateway";
import type { CriteriaChange, HireCriteriaInput } from "./candidates";
import * as flow from "./hireFlow";

// Wasp operations for the hiring flow (WP5, scope change 2026-11-22). Names agreed on the board so
// person-3's thread can call them from wasp/client/operations. All logic is in hireFlow.ts.

type Ctx = { user?: { id: string } | null; entities: { Goal: any } };

function requireUser(context: Ctx): string {
  if (!context.user) throw new HttpError(401);
  return context.user.id;
}

function depsFor(context: Ctx): flow.HireDeps {
  return {
    execute: (req: ActionRequest) => gateway.execute(req) as Promise<GatewayResult>,
    createGoal: (data) => context.entities.Goal.create({ data, select: { id: true } }),
    findGoal: (userId, goalId) => context.entities.Goal.findFirst({ where: { id: goalId, userId }, select: { id: true, userId: true, kind: true, statement: true, icp: true } }),
    saveState: async (goalId, state) => {
      await context.entities.Goal.update({ where: { id: goalId }, data: { icp: state as object } });
    },
  };
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof flow.HireFlowError) throw new HttpError(error.status, error.message);
    throw error;
  }
}

/** The approved criteria from person-3's /calibrate/criteria → a hire goal (PREPARE). */
export const createHireGoal: CreateHireGoal<{ criteria: HireCriteriaInput }, { goalId: string }> = (args, context) =>
  run(() => flow.createHireGoal(requireUser(context), args?.criteria, depsFor(context)));

/** Research the shortlist for a hire goal and rank it with cited sources. */
export const runHireShortlist: RunHireShortlist<{ goalId: string }, flow.HireShortlistEntry[]> = (args, context) =>
  run(() => flow.runHireShortlist(requireUser(context), args.goalId, depsFor(context)));

/** Reject with a reason; returns the proposed criteria change for the confirm card (or null). */
export const rejectMatchWithReason: RejectMatchWithReason<{ matchId: string; reason: string }, { proposedChange: CriteriaChange | null }> = (args, context) =>
  run(() => flow.rejectMatchWithReason(requireUser(context), args.matchId, args.reason, depsFor(context)));

/** preference_confirm: apply the proposed change and return the rerun. */
export const confirmCriteriaChange: ConfirmCriteriaChange<{ goalId: string; proposedChange: CriteriaChange }, flow.HireShortlistEntry[]> = (args, context) =>
  run(() => flow.confirmCriteriaChange(requireUser(context), args.goalId, args.proposedChange, depsFor(context)));

/** Both runs with their evaluation (fit@k before and after), for the comparison view and TraceRoot. */
export const getHireRuns: GetHireRuns<{ goalId: string }, flow.HireRun[]> = (args, context) =>
  run(() => flow.getHireRuns(requireUser(context), args.goalId, depsFor(context)));

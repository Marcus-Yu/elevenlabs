import { describe, expect, it } from "vitest";
import type { ActionRequest, GatewayResult } from "../../shared/contracts";
import { createDiscoveryHandlersFromEnv } from "../../server/gateway/handlers/discovery";
import { DEMO_HIRE_CRITERIA } from "../../server/gateway/handlers/discovery.demo";
import { confirmCriteriaChange, createHireGoal, getHireRuns, HireFlowError, rejectMatchWithReason, runHireShortlist, type HireDeps, type HireGoalRow } from "./hireFlow";

// In-memory goals; execute runs the replay discovery handlers (stand-in for gateway.execute, no rules).
function world() {
  const goals = new Map<string, HireGoalRow>();
  const executed: ActionRequest[] = [];
  const handlers = createDiscoveryHandlersFromEnv({ ADAPTER_MODE: "replay" }) as Record<string, any>;
  const deps: HireDeps = {
    async execute(req) {
      executed.push(req);
      if (req.actionType === "memory.write") return { decision: { outcome: "allow", ruleId: "default" }, logId: "l" } as GatewayResult;
      const h = handlers[req.actionType];
      const out = await h.run(h.payload.parse(req.payload), { userId: req.userId, goalId: req.goalId });
      return { decision: { outcome: "allow", ruleId: "default" }, logId: "l", data: out.data } as GatewayResult;
    },
    async createGoal(data) {
      const id = `goal-${goals.size + 1}`;
      goals.set(id, { id, userId: data.userId, kind: data.kind, statement: data.statement, icp: data.icp });
      return { id };
    },
    async findGoal(userId, goalId) {
      const g = goals.get(goalId);
      return g && g.userId === userId ? g : null;
    },
    async saveState(goalId, state) {
      goals.get(goalId)!.icp = JSON.parse(JSON.stringify(state));
    },
  };
  return { deps, goals, executed };
}

describe("hire flow operations", () => {
  it("criteria → shortlist → reject 'too junior' → confirm → better rerun, persisted on the goal", async () => {
    const { deps, goals, executed } = world();
    const { goalId } = await createHireGoal("userA", DEMO_HIRE_CRITERIA, deps);
    expect(goals.get(goalId)).toMatchObject({ kind: "hire", statement: "Hire a Robotics engineer" });

    const first = await runHireShortlist("userA", goalId, deps);
    expect(first.length).toBeGreaterThan(5);
    expect(executed[0]).toMatchObject({ actionType: "contact.search", origin: "ui", payload: { mode: "criteria" } });
    expect(first.every((r) => r.matchId.startsWith(`${goalId}:`) && r.citedSources.length > 0)).toBe(true);

    const junior = first.slice(0, 5).filter((r) => r.candidate.yearsExperience !== undefined).sort((a, b) => a.candidate.yearsExperience! - b.candidate.yearsExperience!)[0]!;
    const { proposedChange } = await rejectMatchWithReason("userA", junior.matchId, "too junior", deps);
    expect(proposedChange!.changes[0]!.field).toBe("minYearsExperience");
    expect(executed.at(-1)).toMatchObject({ actionType: "memory.write", payload: { kind: "preference" } });

    const rerun = await confirmCriteriaChange("userA", goalId, proposedChange, deps);
    expect(rerun.map((r) => r.matchId)).not.toContain(junior.matchId);

    const runs = await getHireRuns("userA", goalId, deps);
    expect(runs).toHaveLength(2);
    expect(runs[1]!.evaluation.fitAtK).toBeGreaterThan(runs[1]!.comparedTo!.fitAtK);
  });

  it("refuses other users, forged changes and confirming twice", async () => {
    const { deps } = world();
    const { goalId } = await createHireGoal("userA", DEMO_HIRE_CRITERIA, deps);
    const first = await runHireShortlist("userA", goalId, deps);
    await expect(runHireShortlist("userB", goalId, deps)).rejects.toMatchObject({ status: 404 });
    const { proposedChange } = await rejectMatchWithReason("userA", first[3]!.matchId, "too junior", deps);
    await expect(confirmCriteriaChange("userA", goalId, { changes: [{ field: "minYearsExperience", from: 2, to: 0 }] }, deps)).rejects.toMatchObject({ status: 409 });
    await confirmCriteriaChange("userA", goalId, proposedChange, deps);
    await expect(confirmCriteriaChange("userA", goalId, proposedChange, deps)).rejects.toBeInstanceOf(HireFlowError);
  });

  it("rejects malformed criteria", async () => {
    await expect(createHireGoal("userA", { role: "x" }, world().deps)).rejects.toMatchObject({ status: 400 });
  });
});

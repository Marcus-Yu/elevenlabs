import { describe, expect, it } from "vitest";
import { createGoalFromProposal, GoalDraft, needsContactSearch, ProposalError, type ProposalTx } from "./goalDraft";

function fakeTx(proposal: { id: string; userId: string; status: string; proposedGoal: unknown } | null) {
  const goals: unknown[] = [];
  let status = proposal?.status;
  const tx: ProposalTx = {
    needProposal: {
      findFirst: async ({ where }) => (proposal && where.id === proposal.id && where.userId === proposal.userId ? { ...proposal, status: status! } : null),
      updateMany: async ({ where }) => {
        if (proposal && where.id === proposal.id && status === "PENDING") {
          status = "APPROVED";
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    goal: {
      create: async ({ data }) => {
        goals.push(data);
        return { id: `goal-${goals.length}` };
      },
    },
  };
  return { transaction: <T,>(fn: (t: ProposalTx) => Promise<T>) => fn(tx), goals, status: () => status };
}

const proposedGoal = {
  kind: "manufacturer",
  statement: "Find a contract manufacturer for the gripper housing",
  icp: { companySearch: { industries: ["Manufacturing"], keywords: ["injection molding"], countryCodes: ["USA"] } },
};

describe("GoalDraft", () => {
  it("defaults to PREPARE, a daily cap of 10, and infers direction from kind", () => {
    const draft = GoalDraft.parse({ kind: "customers", statement: "Find 3PL customers" });
    expect(draft).toMatchObject({ autonomy: "PREPARE", direction: "SELL", rules: { dailyCap: 10 }, icp: {} });
    expect(GoalDraft.parse({ kind: "manufacturer", statement: "Find a molder" }).direction).toBe("BUY");
    expect(GoalDraft.parse({ kind: "employer", statement: "Find a robotics job" }).direction).toBe("WORK_FOR");
  });

  it("skips contact search for intern goals", () => {
    expect(needsContactSearch({ kind: "intern" })).toBe(false);
    expect(needsContactSearch({ kind: "customers" })).toBe(true);
  });
});

describe("createGoalFromProposal", () => {
  it("creates the goal at the autonomy the user picked and marks the proposal approved", async () => {
    const t = fakeTx({ id: "p1", userId: "u1", status: "PENDING", proposedGoal });
    const result = await createGoalFromProposal({ userId: "u1", proposalId: "p1", autonomy: "WATCH" }, t.transaction);
    expect(result.goalId).toBe("goal-1");
    expect(t.goals[0]).toMatchObject({ userId: "u1", kind: "manufacturer", direction: "BUY", autonomy: "WATCH", rules: { dailyCap: 10 } });
    expect(t.status()).toBe("APPROVED");
  });

  it("applies the user's edits from the review card", async () => {
    const t = fakeTx({ id: "p1", userId: "u1", status: "PENDING", proposedGoal });
    await createGoalFromProposal({ userId: "u1", proposalId: "p1", autonomy: "PREPARE", edits: { statement: "Find a US molder for the gripper housing" } }, t.transaction);
    expect(t.goals[0]).toMatchObject({ statement: "Find a US molder for the gripper housing" });
  });

  it("refuses another user's proposal, a decided proposal, and an invalid one, creating nothing", async () => {
    const other = fakeTx({ id: "p1", userId: "u1", status: "PENDING", proposedGoal });
    await expect(createGoalFromProposal({ userId: "u2", proposalId: "p1", autonomy: "PREPARE" }, other.transaction)).rejects.toMatchObject({ code: "not_found" });

    const decided = fakeTx({ id: "p1", userId: "u1", status: "DISMISSED", proposedGoal });
    await expect(createGoalFromProposal({ userId: "u1", proposalId: "p1", autonomy: "PREPARE" }, decided.transaction)).rejects.toMatchObject({ code: "not_pending" });

    const invalid = fakeTx({ id: "p1", userId: "u1", status: "PENDING", proposedGoal: { kind: "spaceship", statement: "x" } });
    await expect(createGoalFromProposal({ userId: "u1", proposalId: "p1", autonomy: "PREPARE" }, invalid.transaction)).rejects.toBeInstanceOf(ProposalError);

    expect([...other.goals, ...decided.goals, ...invalid.goals]).toEqual([]);
  });

  it("approves only once", async () => {
    const t = fakeTx({ id: "p1", userId: "u1", status: "PENDING", proposedGoal });
    await createGoalFromProposal({ userId: "u1", proposalId: "p1", autonomy: "PREPARE" }, t.transaction);
    await expect(createGoalFromProposal({ userId: "u1", proposalId: "p1", autonomy: "PREPARE" }, t.transaction)).rejects.toMatchObject({ code: "not_pending" });
    expect(t.goals).toHaveLength(1);
  });
});

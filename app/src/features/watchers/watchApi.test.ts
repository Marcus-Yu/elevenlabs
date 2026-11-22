import { describe, expect, it, vi } from "vitest";
import type { ActionRequest } from "../../shared/contracts";
import { buildBrief, generateWatcherToken, handleBrief, handleRun, handleTool, verifyWatcherToken, type WatchDeps, type WatchedGoal } from "./watchApi";

const { token, hash } = generateWatcherToken();
const goal: WatchedGoal = {
  id: "g1",
  userId: "u1",
  status: "ACTIVE",
  statement: "Find 3PL customers",
  watcherTokenHash: hash,
  icp: { companySearch: { industries: ["Logistics"], keywords: ["3PL"], employeeCount: { min: 101, max: 1000 } } },
};

function deps(overrides: Partial<WatchDeps> = {}): WatchDeps & { executed: ActionRequest[] } {
  const executed: ActionRequest[] = [];
  return {
    executed,
    loadGoal: async (id) => (id === goal.id ? goal : null),
    matchedDomains: async () => ["already.com"],
    execute: vi.fn(async (req: ActionRequest) => {
      executed.push(req);
      return { decision: { outcome: "allow" as const, ruleId: "default" }, logId: "log1", data: { companies: [] } };
    }),
    startRun: async () => ({ id: "run1" }),
    finishRun: async (_g, runId) => runId === "run1",
    ...overrides,
  };
}

const auth = `Bearer ${token}`;

describe("watcher tokens", () => {
  it("accepts only the goal's own token", () => {
    expect(verifyWatcherToken(auth, hash)).toBe(true);
    expect(verifyWatcherToken(`Bearer ${generateWatcherToken().token}`, hash)).toBe(false);
    expect(verifyWatcherToken(token, hash)).toBe(false); // missing "Bearer"
    expect(verifyWatcherToken(undefined, hash)).toBe(false);
    expect(verifyWatcherToken(auth, null)).toBe(false); // revoked
  });
});

describe("watcher API", () => {
  it("returns the same 401 for a bad token and an unknown goal", async () => {
    const d = deps();
    expect(await handleBrief("g1", "Bearer nope", d)).toEqual({ status: 401, body: { error: "invalid_watcher_token" } });
    expect(await handleBrief("missing", auth, d)).toEqual({ status: 401, body: { error: "invalid_watcher_token" } });
  });

  it("refuses an ended goal", async () => {
    const d = deps({ loadGoal: async () => ({ ...goal, status: "DONE" }) });
    expect((await handleBrief("g1", auth, d)).status).toBe(403);
  });

  it("serves a brief with searches, existing matches and no profile data", async () => {
    const res = await handleBrief("g1", auth, deps());
    expect(res).toEqual({
      status: 200,
      body: {
        goalId: "g1",
        statement: "Find 3PL customers",
        searches: [{ industries: ["Logistics"], keywords: ["3PL"], employeeCount: { min: 101, max: 1000 } }],
        excludeDomains: ["already.com"],
        fit: { employeeCount: { min: 101, max: 1000 } },
      },
    });
  });

  it("sends allowed tools through the gateway as a tainted watcher request", async () => {
    const d = deps();
    const res = await handleTool("g1", auth, { tool: "company.search", args: { keywords: ["3PL"] } }, d);
    expect(res.status).toBe(200);
    expect(d.executed[0]).toEqual({
      actionType: "company.search",
      userId: "u1",
      goalId: "g1",
      actor: { kind: "agent", id: "watcher:g1" },
      origin: "watcher",
      tainted: true,
      payload: { keywords: ["3PL"] },
    });
  });

  it.each(["outreach.send", "contact.reveal_email", "call.place", "memory.delete", "card.reveal", "draft.create"])(
    "refuses %s with a watcher token before it reaches the gateway",
    async (tool) => {
      const d = deps();
      const res = await handleTool("g1", auth, { tool, args: {} }, d);
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: "tool_not_allowed_for_watcher", tool });
      expect(d.execute).not.toHaveBeenCalled();
    },
  );

  it("records run start and finish", async () => {
    const d = deps();
    expect(await handleRun("g1", auth, { phase: "start", runtime: "maritime" }, d)).toEqual({ status: 200, body: { runId: "run1" } });
    expect(await handleRun("g1", auth, { phase: "finish", runId: "run1", stats: { submitted: 2 } }, d)).toEqual({ status: 200, body: { ok: true } });
    expect((await handleRun("g1", auth, { phase: "finish", runId: "other" }, d)).status).toBe(404);
    expect((await handleRun("g1", auth, { phase: "explode" }, d)).status).toBe(400);
  });

  it("builds a brief from a searches array and ignores malformed entries", () => {
    const brief = buildBrief({ ...goal, icp: { searches: [{ keywords: ["a"] }, "garbage", { keywords: ["b"] }] } }, []);
    expect(("searches" in brief ? brief.searches : [])).toEqual([{ keywords: ["a"] }, { keywords: ["b"] }]);
  });
});

describe("hire research brief", () => {
  const hireGoal: WatchedGoal = {
    ...goal,
    kind: "hire",
    statement: "Hire a robotics engineer",
    icp: {
      hireCriteria: { role: "Robotics engineer", titles: ["robotics engineer", "robotics software engineer"], mustHaveSkills: ["ROS", "C++"], minYearsExperience: 2, countryCodes: ["USA"] },
      // Anything else on the goal must not reach the box.
      salaryCeiling: 185000,
    },
  };

  it("carries the approved criteria only, as one search agent per title", async () => {
    const res = await handleBrief("g1", auth, deps({ loadGoal: async () => hireGoal }));
    expect(res.body).toEqual({
      goalId: "g1",
      statement: "Hire a robotics engineer",
      research: {
        kind: "hire",
        role: "Robotics engineer",
        searches: [
          { mode: "criteria", titles: ["robotics engineer"], skills: ["ROS", "C++"], minYearsExperience: 2, countryCodes: ["USA"], pageSize: 15 },
          { mode: "criteria", titles: ["robotics software engineer"], skills: ["ROS", "C++"], minYearsExperience: 2, countryCodes: ["USA"], pageSize: 15 },
        ],
      },
    });
    expect(JSON.stringify(res.body)).not.toContain("185000");
  });

  it("lets the watcher run contact.search in criteria mode through the gateway", async () => {
    const d = deps({ loadGoal: async () => hireGoal });
    const res = await handleTool("g1", auth, { tool: "contact.search", args: { mode: "criteria", titles: ["robotics engineer"] } }, d);
    expect(res.status).toBe(200);
    expect(d.executed[0]).toMatchObject({ actionType: "contact.search", origin: "watcher", tainted: true });
  });
});

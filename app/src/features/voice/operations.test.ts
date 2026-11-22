import { afterEach, describe, expect, it, vi } from "vitest";
import { speakBriefing } from "./operations";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  findGoal: vi.fn(),
  groupMatches: vi.fn(),
  countMatches: vi.fn(),
  getHireRuns: vi.fn(),
}));

vi.mock("../../server/gateway", () => ({ gateway: { execute: mocks.execute } }));
vi.mock("../matches/operations", () => ({ getHireRuns: mocks.getHireRuns }));
vi.mock("wasp/server", () => ({
  HttpError: class extends Error {
    constructor(public statusCode: number, message: string) { super(message); }
  },
  prisma: {
    goal: { findFirst: mocks.findGoal },
    cardMatch: { groupBy: mocks.groupMatches, count: mocks.countMatches },
  },
}));

const context = { user: { id: "owner" } } as Parameters<typeof speakBriefing>[1];
afterEach(() => vi.resetAllMocks());

describe("spoken match briefing", () => {
  it("rejects arbitrary text and checks goal ownership before generation", async () => {
    await expect(speakBriefing({ goalId: "hire", text: "client text" } as never, context)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.findGoal).not.toHaveBeenCalled();
    mocks.findGoal.mockResolvedValue(null);
    await expect(speakBriefing({ goalId: "other-goal" }, context)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.findGoal).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "other-goal", userId: "owner", kind: "hire", status: "ACTIVE" },
    }));
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("sends aggregate shortlist and opt-in status through the gateway", async () => {
    mocks.findGoal.mockResolvedValue({ icp: { hireCriteria: { role: "Engineer", titles: ["Engineer"] } } });
    mocks.getHireRuns.mockResolvedValue([{ topK: ["private-id-a", "private-id-b"], evaluation: { fitAtK: 1 } }]);
    mocks.groupMatches.mockResolvedValue([
      { aAccepted: true, bAccepted: true, _count: { _all: 1 } },
      { aAccepted: false, bAccepted: true, _count: { _all: 2 } },
    ]);
    mocks.countMatches.mockResolvedValue(3);
    mocks.execute.mockResolvedValue({ decision: { outcome: "allow" }, data: { audio: "AAAA" } });
    const { text, audio } = await speakBriefing({ goalId: "hire" }, context);
    expect(audio).toBe("AAAA");
    expect(text).toContain("2 ranked candidates. 1 meets the required criteria.");
    expect(text).toContain("Waiting for both sides to opt in: 2. Both sides opted in, reveal pending: 1. Introductions revealed: 3.");
    expect(text).not.toContain("private-id");
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      userId: "owner", goalId: "hire", actionType: "voice.speak", payload: { text },
    }));
  });
});

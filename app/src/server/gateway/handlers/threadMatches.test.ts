import { describe, expect, it, vi } from "vitest";
import { createThreadMatchHandlers } from "./threadMatches";
const person = { fullName: "Private Person", title: "Engineer", linkedinUrl: "https://linkedin.com/in/private", skills: ["ROS"], sources: [{ provider: "fiber", claim: "role: Private Person Engineer", url: "https://linkedin.com/in/private", fetchedAt: "2026-01-01" }] };
const icp = { hireCriteria: { role: "Engineer", titles: ["Engineer"], mustHaveSkills: ["ROS"] }, pool: [person], runs: [{}] };
const ctx = { userId: "owner", goalId: "g", actor: { kind: "agent", id: "thread" }, origin: "thread" } as const;
describe("thread shortlist reads", () => {
  it("queries only an active owned hiring goal and returns no identifying profile text", async () => {
    const findFirst = vi.fn().mockResolvedValue({ icp });
    const findMany = vi.fn().mockResolvedValue([{ id: "g", icp }]);
    const handlers = createThreadMatchHandlers({ findFirst, findMany });
    expect((await handlers["thread.list_hiring_goals"].run({}, ctx)).data.goals).toEqual([{ goalId: "g", role: "Engineer", researched: true }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "owner", kind: "hire", status: "ACTIVE" } }));
    const result = await handlers["thread.list_matches"].run({}, ctx);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: "g", userId: "owner", kind: "hire", status: "ACTIVE" }, select: { icp: true } });
    expect(result.data.matches).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/Private Person|linkedin|role:|Engineer/);
    const matchId = result.data.matches[0]!.matchId;
    expect((await handlers["thread.explain_match"].run({ matchId }, ctx)).data.match).toEqual(result.data.matches[0]);
    expect((await handlers["thread.explain_match"].run({ matchId: "other" }, ctx)).data.match).toBeNull();
  });
  it("does not expose another user's goal or an unresearched pool", async () => {
    const findFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ icp: { ...icp, runs: [] } });
    const handlers = createThreadMatchHandlers({ findFirst, findMany: vi.fn() });
    await expect(handlers["thread.list_matches"].run({}, ctx)).rejects.toThrow("Goal unavailable");
    expect((await handlers["thread.list_matches"].run({}, ctx)).data.matches).toEqual([]);
  });
});

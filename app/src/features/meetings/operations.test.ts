import { describe, expect, it, vi } from "vitest";
import { dismissMeetingProposal, listPendingMeetingProposals } from "./operations";

function context(user: { id: string } | null = { id: "u1" }) {
  const findMany = vi.fn(async () => [{ id: "p1", transcriptExcerpt: "need a supplier", proposedGoal: { direction: "BUY", kind: "supplier", statement: "Find a supplier" } }]);
  const updateMany = vi.fn(async () => ({ count: 1 }));
  return { user, entities: { NeedProposal: { findMany, updateMany } } };
}
describe("meeting proposal operations", () => {
  it("lists only the authenticated user's pending proposals", async () => {
    const ctx = context();
    expect(await listPendingMeetingProposals(undefined, ctx)).toHaveLength(1);
    expect(ctx.entities.NeedProposal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", status: "PENDING" } }));
  });
  it("dismisses only the authenticated user's pending proposal", async () => {
    const ctx = context();
    await dismissMeetingProposal({ proposalId: "p1" }, ctx);
    expect(ctx.entities.NeedProposal.updateMany).toHaveBeenCalledWith({ where: { id: "p1", userId: "u1", status: "PENDING" }, data: { status: "DISMISSED" } });
    ctx.entities.NeedProposal.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(dismissMeetingProposal({ proposalId: "p2" }, ctx)).rejects.toThrow();
  });
  it("rejects unauthenticated access before querying", async () => {
    const ctx = context(null);
    await expect(listPendingMeetingProposals(undefined, ctx)).rejects.toThrow();
    await expect(dismissMeetingProposal({ proposalId: "p1" }, ctx)).rejects.toThrow();
    expect(ctx.entities.NeedProposal.findMany).not.toHaveBeenCalled();
    expect(ctx.entities.NeedProposal.updateMany).not.toHaveBeenCalled();
  });
});

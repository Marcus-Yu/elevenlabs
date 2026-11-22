import { describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("wasp/server", () => ({ prisma: { $transaction: db.transaction },
  HttpError: class extends Error { constructor(public statusCode: number, message: string) { super(message); } } }));
import { approveMeetingProposal, dismissMeetingProposal, listPendingMeetingProposals } from "./operations";

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
  it("approves only the owner's pending proposal at the selected autonomy", async () => {
    let status = "PENDING";
    const goals: unknown[] = [];
    const tx = { needProposal: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => where.id === "p1" && where.userId === "u1" ? { id: "p1", userId: "u1", status, proposedGoal: { kind: "supplier", direction: "BUY", statement: "Find a supplier" } } : null),
      updateMany: vi.fn(async () => { if (status !== "PENDING") return { count: 0 }; status = "APPROVED"; return { count: 1 }; }),
    }, goal: { create: vi.fn(async ({ data }: { data: unknown }) => { goals.push(data); return { id: "g1" }; }) } };
    db.transaction.mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx));
    const args = { proposalId: "p1", statement: "Find a local supplier", autonomy: "WATCH" };
    await expect(approveMeetingProposal(args, context({ id: "u2" }))).rejects.toMatchObject({ statusCode: 404 });
    await expect(approveMeetingProposal({ ...args, autonomy: "INVALID" }, context())).rejects.toMatchObject({ statusCode: 400 });
    expect(await approveMeetingProposal(args, context())).toEqual({ goalId: "g1" });
    await expect(approveMeetingProposal(args, context())).rejects.toMatchObject({ statusCode: 409 });
    expect(goals).toEqual([expect.objectContaining({ userId: "u1", statement: args.statement, kind: "supplier", autonomy: "WATCH" })]);
  });
  it("rejects unauthenticated access before querying", async () => {
    const ctx = context(null);
    await expect(listPendingMeetingProposals(undefined, ctx)).rejects.toThrow();
    await expect(dismissMeetingProposal({ proposalId: "p1" }, ctx)).rejects.toThrow();
    await expect(approveMeetingProposal({ proposalId: "p1", statement: "Find a supplier", autonomy: "WATCH" }, ctx)).rejects.toThrow();
    expect(ctx.entities.NeedProposal.findMany).not.toHaveBeenCalled();
    expect(ctx.entities.NeedProposal.updateMany).not.toHaveBeenCalled();
  });
});

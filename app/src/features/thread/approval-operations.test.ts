import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideThreadApproval, getThreadApproval } from "./approval-operations";

const gateway = vi.hoisted(() => ({ decideApproval: vi.fn() }));
vi.mock("../../server/gateway", () => ({ gateway }));
vi.mock("wasp/server", () => ({
  HttpError: class extends Error {
    constructor(public statusCode: number, message: string) {
      super(message);
    }
  },
}));

beforeEach(() => gateway.decideApproval.mockReset());

describe("thread approvals", () => {
  it("reads only the signed-in user's exact approval", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "a1", actionType: "outreach.send", status: "PENDING",
      payload: { to: "demo@example.test", subject: "Draft", body: "Synthetic message", other: "private" },
    });
    const context = { user: { id: "u1" }, entities: { Approval: { findFirst } } };
    const approval = await getThreadApproval(
      { approvalId: "a1" }, context as unknown as Parameters<typeof getThreadApproval>[1],
    );
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1", userId: "u1" } }));
    expect(approval).toEqual({
      id: "a1", actionType: "outreach.send", status: "PENDING",
      recipient: "demo@example.test", subject: "Draft", body: "Synthetic message",
    });
  });

  it("supplies the actor from auth and returns only the outcome and rule", async () => {
    gateway.decideApproval.mockResolvedValue({
      decision: { outcome: "deny", ruleId: "ownership", reason: "internal details" },
      logId: "log",
    });
    const context = { user: { id: "signed-in" } } as Parameters<typeof decideThreadApproval>[1];
    await expect(decideThreadApproval({ approvalId: "a1", decision: "approve" }, context))
      .resolves.toEqual({ outcome: "deny", ruleId: "ownership" });
    expect(gateway.decideApproval).toHaveBeenCalledWith({
      approvalId: "a1", decision: "approve", userId: "signed-in", via: "thread",
    });
  });

  it("never dispatches an approval from a signed-out user", async () => {
    const context = {} as Parameters<typeof decideThreadApproval>[1];
    await expect(decideThreadApproval({ approvalId: "a1", decision: "deny" }, context)).rejects.toThrow("Sign in");
    expect(gateway.decideApproval).not.toHaveBeenCalled();
  });
});

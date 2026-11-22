import { describe, expect, it } from "vitest";
import { z } from "zod";
import { OutreachSendPayload } from "./payloads";
import { hashApprovalPayload } from "./payloadHash";
import { GatewayHandlerError } from "./pipeline";
import { createWorld, GOAL, OTHER_USER, RECIPIENT, request, sendPayload, USER } from "./testing/world";
import { defineHandler } from "./types";

async function pendingSend(world: ReturnType<typeof createWorld>, overrides = {}) {
  const result = await world.gateway.execute(request("outreach.send", sendPayload(overrides)));
  expect(result.decision.outcome).toBe("needs_approval");
  return (result.decision as { approvalId: string }).approvalId;
}

describe("approval lifecycle", () => {
  it("creates a PENDING approval with the exact payload and its hash", async () => {
    const world = createWorld();
    const id = await pendingSend(world);
    const approval = world.store.approvals.get(id)!;
    expect(approval).toMatchObject({ userId: USER, goalId: GOAL, actionType: "outreach.send", status: "PENDING", payload: sendPayload() });
    expect(approval.payloadHash).toBe(hashApprovalPayload({ userId: USER, goalId: GOAL, actionType: "outreach.send", payload: sendPayload() }));
    expect(world.store.logs[0]).toMatchObject({ decision: "NEEDS_APPROVAL", ruleId: "first_contact", reason: expect.stringContaining(id) });
  });

  it("approving executes the stored payload and marks it EXECUTED", async () => {
    const world = createWorld();
    const id = await pendingSend(world);
    const result = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "thread" });
    expect(result.decision).toEqual({ outcome: "allow", ruleId: "sandbox" });
    expect(result.data).toMatchObject({ approvalId: id, originalRecipient: RECIPIENT, to: "sandbox@atlas.example" });
    expect(world.store.approvals.get(id)).toMatchObject({ status: "EXECUTED", decidedVia: "thread" });
    expect(world.store.logs.at(-1)).toMatchObject({ actionType: "outreach.send", decision: "ALLOW", origin: "thread", actor: { kind: "user", id: USER } });
  });

  it("an approved first contact lets later ACT sends to that recipient through", async () => {
    const world = createWorld({ autonomy: "ACT" });
    const id = await pendingSend(world);
    await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    expect((await world.gateway.execute(request("outreach.send", sendPayload()))).decision).toEqual({ outcome: "allow", ruleId: "sandbox" });
  });

  it("denying marks it DENIED and runs nothing", async () => {
    const world = createWorld();
    const id = await pendingSend(world);
    const result = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "deny", via: "web" });
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "user_denied" });
    expect(result.data).toBeUndefined();
    expect(world.store.approvals.get(id)).toMatchObject({ status: "DENIED", decidedVia: "web" });
  });

  it("only the owning user can decide; others get the same answer as a missing id", async () => {
    const world = createWorld();
    const id = await pendingSend(world);
    const foreign = await world.gateway.decideApproval({ approvalId: id, userId: OTHER_USER, decision: "approve", via: "voice" });
    const missing = await world.gateway.decideApproval({ approvalId: "approval_nope", userId: OTHER_USER, decision: "approve", via: "voice" });
    expect(foreign.decision).toEqual(missing.decision);
    expect(foreign.decision).toMatchObject({ outcome: "deny", ruleId: "ownership" });
    expect(world.store.approvals.get(id)!.status).toBe("PENDING");
    expect(world.store.logs.at(-2)).toMatchObject({ userId: OTHER_USER, goalId: null, origin: "voice" });
  });

  it("re-runs the deny rules at execution: a goal switched to WATCH cannot send", async () => {
    const world = createWorld();
    const id = await pendingSend(world);
    world.store.goals.get(GOAL)!.autonomy = "WATCH";
    const result = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "autonomy_watch" });
    expect(world.store.approvals.get(id)!.status).toBe("FAILED");
  });

  it("re-runs the deny rules at execution: a recipient who opted out since is not contacted", async () => {
    const world = createWorld();
    const id = await pendingSend(world);
    world.store.optOuts.add(RECIPIENT);
    const result = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "opt_out" });
  });

  it("cannot be decided twice", async () => {
    const world = createWorld();
    const id = await pendingSend(world);
    await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    const again = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    expect(again.decision).toMatchObject({ outcome: "deny", ruleId: "approval_state", reason: "approval is EXECUTED" });
  });

  it("expires after 24 hours", async () => {
    const world = createWorld();
    const id = await pendingSend(world);
    world.advance(24 * 60 * 60 * 1000 + 1);
    const result = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "approval_expired" });
    expect(world.store.approvals.get(id)!.status).toBe("EXPIRED");
  });

  it("refuses any change to the stored payload, user or goal", async () => {
    for (const tamper of [
      (a: { payload: unknown }) => ((a.payload as { subject: string }).subject = "Changed"),
      (a: { goalId: string | null }) => (a.goalId = "goal_2"),
    ] as ((a: never) => void)[]) {
      const world = createWorld();
      const id = await pendingSend(world);
      tamper(world.store.approvals.get(id)! as never);
      const result = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
      expect(result.decision).toMatchObject({ outcome: "deny", ruleId: "payload_hash" });
    }
  });

  it("hashes independently of key order, as jsonb may reorder keys", () => {
    const a = hashApprovalPayload({ userId: "u", goalId: "g", actionType: "outreach.send", payload: { a: 1, b: { c: 2, d: 3 } } });
    const b = hashApprovalPayload({ userId: "u", goalId: "g", actionType: "outreach.send", payload: { b: { d: 3, c: 2 }, a: 1 } });
    expect(a).toBe(b);
  });

  it("a paid email reveal runs only after approval", async () => {
    const world = createWorld({ autonomy: "ACT" });
    const result = await world.gateway.execute(request("contact.reveal_email", { fullName: "Sam", companyDomain: "customer.example" }));
    expect(result.decision).toMatchObject({ outcome: "needs_approval", ruleId: "paid_reveal" });
    expect(result.data).toBeUndefined();
    const id = (result.decision as { approvalId: string }).approvalId;
    const approved = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" });
    expect(approved.decision).toEqual({ outcome: "allow", ruleId: "default" });
    expect(approved.data).toMatchObject({ stub: true, email: expect.stringMatching(/\.example$/) });
  });

  it("marks the approval FAILED when the handler throws", async () => {
    const failing = defineHandler({ payload: OutreachSendPayload.extend({ extra: z.string().optional() }), run: async () => Promise.reject(new Error("smtp down")) });
    const world = createWorld({ handlers: { "outreach.send": failing } });
    const id = await pendingSend(world);
    const error = await world.gateway.decideApproval({ approvalId: id, userId: USER, decision: "approve", via: "web" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GatewayHandlerError);
    expect(world.store.approvals.get(id)!.status).toBe("FAILED");
  });
});

import { describe, expect, it } from "vitest";
import { ActivityFilters, activityWhere, DecideApprovalArgs, pageOf, parseArgs, PendingApprovalsArgs } from "./queries";

const filters = (input: unknown) => {
  const parsed = parseArgs(ActivityFilters, input);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.data;
};

describe("activityWhere", () => {
  it("always scopes to the user", () => {
    expect(activityWhere("user_1", filters({}))).toEqual({ userId: "user_1" });
  });

  it("applies each filter", () => {
    const where = activityWhere(
      "user_1",
      filters({ goalId: "g", decision: "ALLOW", actionType: "outreach.send", ruleId: "sandbox", origin: "thread", since: "2026-11-22T00:00:00Z" }),
    );
    expect(where).toEqual({
      userId: "user_1",
      goalId: "g",
      decision: "ALLOW",
      actionType: "outreach.send",
      ruleId: "sandbox",
      origin: "thread",
      ts: { gte: new Date("2026-11-22T00:00:00Z") },
    });
  });

  it("filters to denied rows with deniedOnly", () => {
    expect(activityWhere("u", filters({ deniedOnly: true, decision: "ALLOW" }))).toMatchObject({ decision: "DENY" });
  });

  it("rejects unknown filters, so a client cannot override userId", () => {
    expect(parseArgs(ActivityFilters, { userId: "someone_else" })).toMatchObject({ ok: false });
  });

  it("defaults and caps the page size", () => {
    expect(filters({}).limit).toBe(50);
    expect(parseArgs(ActivityFilters, { limit: 1000 })).toMatchObject({ ok: false });
  });
});

describe("pageOf", () => {
  it("returns a cursor only when there is another page", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pageOf(rows, 2)).toEqual({ rows: [{ id: "a" }, { id: "b" }], nextCursor: "b" });
    expect(pageOf(rows, 3)).toEqual({ rows, nextCursor: null });
  });
});

describe("approval args", () => {
  it("defaults via to web and refuses voice from the client", () => {
    expect(parseArgs(DecideApprovalArgs, { approvalId: "a", decision: "approve" })).toEqual({ ok: true, data: { approvalId: "a", decision: "approve", via: "web" } });
    expect(parseArgs(DecideApprovalArgs, { approvalId: "a", decision: "approve", via: "voice" })).toMatchObject({ ok: false });
  });

  it("rejects a client-supplied userId", () => {
    expect(parseArgs(DecideApprovalArgs, { approvalId: "a", decision: "approve", userId: "x" })).toMatchObject({ ok: false });
  });

  it("accepts no arguments for pending approvals", () => {
    expect(parseArgs(PendingApprovalsArgs, undefined)).toEqual({ ok: true, data: {} });
  });
});

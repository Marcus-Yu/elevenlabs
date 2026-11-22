import { describe, expect, it } from "vitest";
import { gatewayDisplay } from "./gateway-result";

describe("gatewayDisplay", () => {
  it("preserves allowed data and labels stubs", () => {
    const data = { stub: true, value: "synthetic" };
    expect(gatewayDisplay({ decision: { outcome: "allow", ruleId: "allow" }, logId: "l", data })).toEqual({ kind: "allowed", data, stub: true });
    expect(gatewayDisplay({ decision: { outcome: "allow", ruleId: "allow" }, logId: "l", data: { value: 1 } })).toEqual({ kind: "allowed", data: { value: 1 }, stub: false });
  });
  it("returns only fixed denial text and rule id", () => {
    const result = gatewayDisplay({ decision: { outcome: "deny", ruleId: "consent", reason: "secret token" }, logId: "l", data: { error: "provider secret" } });
    expect(result).toEqual({ kind: "denied", ruleId: "consent", message: "This action was denied by a policy rule." });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("preserves the approval id, without unrelated data", () => {
    expect(gatewayDisplay({ decision: { outcome: "needs_approval", ruleId: "approval", approvalId: "db-id" }, logId: "l", data: "secret" })).toEqual({ kind: "pending_approval", approvalId: "db-id", message: "This action needs your approval." });
  });
});

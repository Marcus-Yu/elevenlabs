import type { GatewayResult } from "../../shared/contracts/gateway";

/** A display-safe decision view; denial reasons and unrelated data never cross this boundary. */
export type GatewayDisplay<T> =
  | { kind: "allowed"; data: T | undefined; stub: boolean }
  | { kind: "denied"; ruleId: string; message: "This action was denied by a policy rule." }
  | { kind: "pending_approval"; approvalId: string; message: "This action needs your approval." };

export function gatewayDisplay<T>(result: GatewayResult<T>): GatewayDisplay<T> {
  switch (result.decision.outcome) {
    case "allow": {
      const data = result.data;
      const stub = typeof data === "object" && data !== null && "stub" in data && data.stub === true;
      return { kind: "allowed", data, stub };
    }
    case "deny":
      return { kind: "denied", ruleId: result.decision.ruleId, message: "This action was denied by a policy rule." };
    case "needs_approval":
      return { kind: "pending_approval", approvalId: result.decision.approvalId, message: "This action needs your approval." };
    default: {
      const exhaustive: never = result.decision;
      return exhaustive;
    }
  }
}

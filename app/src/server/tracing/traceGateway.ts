import type { GatewayResult } from "../../shared/contracts";
import type { Gateway } from "../gateway/engine";
import { annotateSpan, traceRun } from "./traceroot";

// Wraps the gateway in a TraceRoot span per call (WP7). The engine is untouched: the span is open
// while the engine writes its ActionLog row, so withTraceIds (logStamp.ts) stamps that row with
// the trace id. Spans carry action type, decision and rule id, never the payload.

function requestFields(raw: unknown): { actionType: string; goalId: string | null; actorKind: string; origin: string } {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const actor = (value.actor && typeof value.actor === "object" ? value.actor : {}) as Record<string, unknown>;
  return {
    actionType: typeof value.actionType === "string" ? value.actionType.slice(0, 100) : "unknown",
    goalId: typeof value.goalId === "string" ? value.goalId : null,
    actorKind: typeof actor.kind === "string" ? actor.kind : "unknown",
    origin: typeof value.origin === "string" ? value.origin : "unknown",
  };
}

export function resultAttributes(result: GatewayResult) {
  const { decision } = result;
  return {
    "atlas.decision": decision.outcome,
    "atlas.rule_id": decision.ruleId,
    "atlas.log_id": result.logId,
    "atlas.approval_id": decision.outcome === "needs_approval" ? decision.approvalId : null,
  };
}

export function traceGateway(inner: Gateway): Gateway {
  return {
    execute: (request) => {
      const fields = requestFields(request);
      return traceRun(
        `gateway.${fields.actionType}`,
        { "atlas.action_type": fields.actionType, "atlas.goal_id": fields.goalId, "atlas.actor_kind": fields.actorKind, "atlas.origin": fields.origin },
        async () => {
          const result = await inner.execute(request);
          annotateSpan(resultAttributes(result));
          return result;
        },
        { type: "tool" },
      );
    },
    decideApproval: (input) =>
      traceRun(
        "gateway.approval.decide",
        { "atlas.approval_id": input.approvalId, "atlas.approval_decision": input.decision },
        async () => {
          const result = await inner.decideApproval(input);
          annotateSpan(resultAttributes(result));
          return result;
        },
        { type: "tool" },
      ),
  };
}

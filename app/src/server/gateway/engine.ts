import {
  ACTION_TYPES,
  ActionRequestSchema,
  ActorSchema,
  RequestOriginSchema,
  type GatewayResult,
} from "../../shared/contracts";
import { decideApproval, type DecideApprovalInput } from "./approvals";
import { CORE_PAYLOADS } from "./payloads";
import { decideAndRun, denyResult, type GatewayDeps, type LogSubject } from "./pipeline";
import { ENGINE_RULE_IDS } from "./rules/index";
import { validatePayload } from "./rules/schema";

// The action gateway (docs/IMPLEMENTATION_PLAN.md §8). Model tools, jobs, API handlers and UI call
// gateway.execute(); nothing else reaches a handler or an adapter.

export interface Gateway {
  /** Validates, runs the rules, writes one ActionLog row, then runs the handler when allowed. */
  execute(request: unknown): Promise<GatewayResult>;
  /** The owning user approves or denies a pending Approval; approval executes the stored payload. */
  decideApproval(input: DecideApprovalInput): Promise<GatewayResult>;
}

export function createGateway(deps: GatewayDeps): Gateway {
  return {
    execute: (request) => execute(deps, request),
    decideApproval: (input) => decideApproval(deps, input),
  };
}

async function execute(deps: GatewayDeps, raw: unknown): Promise<GatewayResult> {
  const envelope = ActionRequestSchema.safeParse(raw);
  if (!envelope.success) {
    const subject = fallbackSubject(raw);
    if (!(ACTION_TYPES as readonly string[]).includes(subject.actionType)) {
      return denyResult(deps, subject, ENGINE_RULE_IDS.unknownAction, `unknown action type: ${subject.actionType}`);
    }
    const issue = envelope.error.issues[0];
    return denyResult(deps, subject, ENGINE_RULE_IDS.schema, `invalid request: ${issue?.path.join(".")}: ${issue?.message}`);
  }
  const request = envelope.data;
  const handler = deps.registry.get(request.actionType);
  if (!handler) {
    return denyResult(deps, fallbackSubject(request), ENGINE_RULE_IDS.unknownAction, `no handler registered for ${request.actionType}`);
  }
  const coreSchema = CORE_PAYLOADS[request.actionType as keyof typeof CORE_PAYLOADS];
  const validated = validatePayload(handler.payload, coreSchema, request.payload);
  if (!validated.ok) return denyResult(deps, fallbackSubject(request), ENGINE_RULE_IDS.schema, validated.reason);
  return decideAndRun(deps, { ...request, payload: validated.payload }, handler, "request");
}

/** Best-effort log fields for a request that may have failed validation. */
function fallbackSubject(raw: unknown): LogSubject {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const actor = ActorSchema.safeParse(value.actor);
  const origin = RequestOriginSchema.safeParse(value.origin);
  return {
    userId: typeof value.userId === "string" && value.userId ? value.userId : "unknown",
    goalId: typeof value.goalId === "string" && value.goalId ? value.goalId : null,
    actor: actor.success ? actor.data : { kind: "agent", id: "unknown" },
    origin: origin.success ? origin.data : "system",
    actionType: typeof value.actionType === "string" && value.actionType ? value.actionType.slice(0, 100) : "unknown",
    payload: value.payload,
  };
}

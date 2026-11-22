import { ActionTypeSchema, type GatewayResult, type RequestOrigin } from "../../shared/contracts";
import { hashApprovalPayload } from "./payloadHash";
import { CORE_PAYLOADS } from "./payloads";
import { decideAndRun, denyResult, GatewayHandlerError, type GatewayDeps, type LogSubject } from "./pipeline";
import { ENGINE_RULE_IDS } from "./rules/index";
import { validatePayload } from "./rules/schema";
import type { ApprovalRecord, DecisionChannel } from "./store";

// Approval lifecycle (WP1 step 3). An Approval stores the exact payload and its hash. Only the
// owning user can decide it. Approving re-checks the hash, re-runs the deny rules and executes the
// stored payload, never a fresh model output. Each decideApproval call writes one ActionLog row.

/** Pending approvals older than this expire instead of executing. */
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export interface DecideApprovalInput {
  approvalId: string;
  /** The signed-in user (web, thread) or the verified called user (voice). */
  userId: string;
  decision: "approve" | "deny";
  via: DecisionChannel;
}

const ORIGIN_FOR: Record<DecisionChannel, RequestOrigin> = { web: "ui", thread: "thread", voice: "voice" };

export async function decideApproval(deps: GatewayDeps, input: DecideApprovalInput): Promise<GatewayResult> {
  const now = deps.now?.() ?? new Date();
  const approval = await deps.store.getApproval(input.approvalId);
  const subject: LogSubject = {
    userId: input.userId,
    goalId: null,
    actor: { kind: "user", id: input.userId },
    origin: ORIGIN_FOR[input.via],
    actionType: approval?.actionType ?? "unknown",
    payload: { approvalId: input.approvalId, decision: input.decision },
  };
  // Same answer for a missing approval and someone else's, so ids can't be probed.
  if (!approval || approval.userId !== input.userId) {
    return denyResult(deps, subject, ENGINE_RULE_IDS.ownership, "approval not found for this user");
  }
  subject.goalId = approval.goalId;

  if (approval.status !== "PENDING") {
    return denyResult(deps, subject, ENGINE_RULE_IDS.approvalState, `approval is ${approval.status}`);
  }
  if (now.getTime() - approval.createdAt.getTime() > APPROVAL_TTL_MS) {
    await deps.store.transitionApproval(approval.id, ["PENDING"], { status: "EXPIRED" });
    return denyResult(deps, subject, ENGINE_RULE_IDS.approvalExpired, "approval expired before it was decided");
  }

  const decided = { decidedVia: input.via, decidedAt: now };
  if (input.decision === "deny") {
    if (!(await deps.store.transitionApproval(approval.id, ["PENDING"], { status: "DENIED", ...decided }))) {
      return denyResult(deps, subject, ENGINE_RULE_IDS.approvalState, "approval was decided concurrently");
    }
    return denyResult(deps, subject, ENGINE_RULE_IDS.userDenied, `denied by the user via ${input.via}`);
  }

  if (!(await deps.store.transitionApproval(approval.id, ["PENDING"], { status: "APPROVED", ...decided }))) {
    return denyResult(deps, subject, ENGINE_RULE_IDS.approvalState, "approval was decided concurrently");
  }
  return executeApproved(deps, approval, input, subject);
}

async function executeApproved(
  deps: GatewayDeps,
  approval: ApprovalRecord,
  input: DecideApprovalInput,
  subject: LogSubject,
): Promise<GatewayResult> {
  const fail = async (ruleId: string, reason: string) => {
    await deps.store.transitionApproval(approval.id, ["APPROVED"], { status: "FAILED" });
    return denyResult(deps, subject, ruleId, reason);
  };

  const expectedHash = hashApprovalPayload({
    userId: approval.userId,
    goalId: approval.goalId,
    actionType: approval.actionType,
    payload: approval.payload,
  });
  if (expectedHash !== approval.payloadHash) {
    return fail(ENGINE_RULE_IDS.payloadHash, "stored payload does not match its hash; refusing to execute");
  }

  const actionType = ActionTypeSchema.safeParse(approval.actionType);
  const handler = actionType.success ? deps.registry.get(actionType.data) : undefined;
  if (!actionType.success || !handler) {
    return fail(ENGINE_RULE_IDS.unknownAction, `no handler registered for ${approval.actionType}`);
  }
  const coreSchema = CORE_PAYLOADS[actionType.data as keyof typeof CORE_PAYLOADS];
  const validated = validatePayload(handler.payload, coreSchema, approval.payload);
  if (!validated.ok) return fail(ENGINE_RULE_IDS.schema, validated.reason);

  let result: GatewayResult;
  try {
    result = await decideAndRun(
      deps,
      {
        actionType: actionType.data,
        userId: approval.userId,
        ...(approval.goalId ? { goalId: approval.goalId } : {}),
        actor: { kind: "user", id: input.userId },
        origin: ORIGIN_FOR[input.via],
        // A human approved this exact payload, which the hash check above confirmed.
        tainted: false,
        payload: validated.payload,
      },
      handler,
      "execute",
      approval.id,
    );
  } catch (error) {
    if (error instanceof GatewayHandlerError) {
      await deps.store.transitionApproval(approval.id, ["APPROVED"], { status: "FAILED" });
    }
    throw error;
  }
  const status = result.decision.outcome === "allow" ? "EXECUTED" : "FAILED";
  await deps.store.transitionApproval(approval.id, ["APPROVED"], { status });
  return result;
}

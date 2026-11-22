import type { SuperJSONValue } from "wasp/core/serialization";
import type { Approval } from "wasp/entities";
import { HttpError } from "wasp/server";
import type { DecideApproval, GetApproval, GetPendingApprovals } from "wasp/server/operations";
import type { Decision } from "../../shared/contracts";
import { gateway } from "../../server/gateway";
import { ApprovalByIdArgs, DecideApprovalArgs, parseArgs, PendingApprovalsArgs } from "../../server/gateway/queries";

// Shared approval operations (WP1). The thread card (WP4), the inbox (WP6) and voice (WP9, via
// gateway.decideApproval) all read and decide the same Approval row.

function requireUser(context: { user?: { id: string } | null }): string {
  if (!context.user) throw new HttpError(401);
  return context.user.id;
}

function parseOrThrow<T>(result: { ok: true; data: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new HttpError(400, result.message);
  return result.data;
}

/** The signed-in user's PENDING approvals, newest first, optionally for one goal. */
export const getPendingApprovals: GetPendingApprovals<{ goalId?: string } | void, Approval[]> = async (args, context) => {
  const userId = requireUser(context);
  const { goalId } = parseOrThrow(parseArgs(PendingApprovalsArgs, args));
  return context.entities.Approval.findMany({
    where: { userId, status: "PENDING", ...(goalId ? { goalId } : {}) },
    orderBy: { createdAt: "desc" },
  });
};

/** One approval of the signed-in user, in any status. 404 for a missing or foreign id. */
export const getApproval: GetApproval<{ approvalId: string }, Approval> = async (args, context) => {
  const userId = requireUser(context);
  const { approvalId } = parseOrThrow(parseArgs(ApprovalByIdArgs, args));
  const approval = await context.entities.Approval.findFirst({ where: { id: approvalId, userId } });
  if (!approval) throw new HttpError(404, "approval not found");
  return approval;
};

/** GatewayResult in a form Wasp can serialise to the client. */
export type DecisionResult = { decision: Decision; logId: string; data?: SuperJSONValue };

/**
 * Approve or deny as the signed-in user. Approving executes the stored payload through the
 * gateway. The result carries the decision and rule id; a refusal is a result, not an error.
 */
export const decideApproval: DecideApproval<{ approvalId: string; decision: "approve" | "deny"; via?: "web" | "thread" }, DecisionResult> = async (
  args,
  context,
) => {
  const userId = requireUser(context);
  const { approvalId, decision, via } = parseOrThrow(parseArgs(DecideApprovalArgs, args));
  const result = await gateway.decideApproval({ approvalId, userId, decision, via });
  return { decision: result.decision, logId: result.logId, ...(result.data === undefined ? {} : { data: result.data as SuperJSONValue }) };
};

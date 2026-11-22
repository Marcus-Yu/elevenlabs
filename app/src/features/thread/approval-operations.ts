import { z } from "zod";
import { HttpError } from "wasp/server";
import type { DecideThreadApproval, GetThreadApproval } from "wasp/server/operations";
import { gateway } from "../../server/gateway";

const approvalId = z.string().min(1).max(160);
const decisionSchema = z.object({ approvalId, decision: z.enum(["approve", "deny"]) });

export type ThreadApproval = {
  id: string;
  actionType: string;
  status: string;
  recipient?: string;
  subject?: string;
  body?: string;
};

export type ThreadApprovalDecision = { outcome: "allow" | "deny" | "needs_approval"; ruleId: string };

export const getThreadApproval: GetThreadApproval<{ approvalId: string }, ThreadApproval | null> =
  async (args, context) => {
    if (!context.user) throw new HttpError(401, "Sign in to review an approval.");
    const parsed = approvalId.safeParse(args?.approvalId);
    if (!parsed.success) throw new HttpError(400, "An approval ID is required.");
    const row = await context.entities.Approval.findFirst({
      where: { id: parsed.data, userId: context.user.id },
      select: { id: true, actionType: true, status: true, payload: true },
    });
    if (!row) return null;
    const base = { id: row.id, actionType: row.actionType, status: row.status };
    if (row.actionType !== "outreach.send") return base;
    const payload = z.object({ to: z.string(), subject: z.string(), body: z.string() }).safeParse(row.payload);
    if (!payload.success) return base;
    return { ...base, recipient: payload.data.to, subject: payload.data.subject, body: payload.data.body };
  };

export const decideThreadApproval: DecideThreadApproval<z.input<typeof decisionSchema>, ThreadApprovalDecision> =
  async (input, context) => {
    if (!context.user) throw new HttpError(401, "Sign in to decide an approval.");
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) throw new HttpError(400, "Select a valid approval decision.");
    const result = await gateway.decideApproval({ ...parsed.data, userId: context.user.id, via: "thread" });
    return { outcome: result.decision.outcome, ruleId: result.decision.ruleId };
  };

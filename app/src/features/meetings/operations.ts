import { HttpError, prisma } from "wasp/server";
import { z } from "zod";
import { AUTONOMY, createGoalFromProposal, ProposalError, type ProposalTx } from "../goals/goalDraft";
import type { GoalProposal } from "./need-detection";

type ProposalRow = { id: string; transcriptExcerpt: string; proposedGoal: unknown };
type Context = {
  user?: { id: string } | null;
  entities: { NeedProposal: {
    findMany(args: { where: { userId: string; status: "PENDING" }; select: { id: true; transcriptExcerpt: true; proposedGoal: true }; orderBy: { createdAt: "desc" } }): Promise<ProposalRow[]>;
    updateMany(args: { where: { id: string; userId: string; status: "PENDING" }; data: { status: "DISMISSED" } }): Promise<{ count: number }>;
  } };
};

function userId(context: Context): string {
  if (!context.user?.id) throw new Error("Authentication required");
  return context.user.id;
}

/** Never expose another user's proposals. Malformed stored records are not rendered. */
export async function listPendingMeetingProposals(_args: void, context: Context) {
  const rows = await context.entities.NeedProposal.findMany({ where: { userId: userId(context), status: "PENDING" },
    select: { id: true, transcriptExcerpt: true, proposedGoal: true }, orderBy: { createdAt: "desc" } });
  return rows.flatMap(row => {
    const goal = row.proposedGoal;
    if (!row.transcriptExcerpt || typeof goal !== "object" || goal === null || Array.isArray(goal)) return [];
    const g = goal as Record<string, unknown>;
    if (typeof g.direction !== "string" || !["SELL", "BUY", "WORK_FOR"].includes(g.direction) ||
        typeof g.kind !== "string" || !["customers", "investors", "manufacturer", "supplier", "intern", "employer"].includes(g.kind) ||
        typeof g.statement !== "string" || !g.statement.trim() || g.statement.length > 500) return [];
    return [{ id: row.id, proposal: { transcriptExcerpt: row.transcriptExcerpt, proposedGoal: {
      direction: g.direction, kind: g.kind, statement: g.statement,
    } as GoalProposal["proposedGoal"] } }];
  });
}

/** One conditional update prevents cross-user and non-pending dismissals. */
export async function dismissMeetingProposal(args: { proposalId: string }, context: Context) {
  const owner = userId(context);
  if (!args || typeof args.proposalId !== "string" || !args.proposalId) throw new Error("Invalid proposal");
  const result = await context.entities.NeedProposal.updateMany({ where: { id: args.proposalId, userId: owner, status: "PENDING" }, data: { status: "DISMISSED" } });
  if (result.count !== 1) throw new Error("Pending proposal not found");
}

const approvalInput = z.object({
  proposalId: z.string().min(1).max(256),
  autonomy: z.enum(AUTONOMY),
  statement: z.string().trim().min(5).max(500),
}).strict();

/** An explicit owner action atomically claims the pending proposal and creates one goal. */
export async function approveMeetingProposal(args: unknown, context: Context): Promise<{ goalId: string }> {
  if (!context.user?.id) throw new HttpError(401, "Authentication required");
  const input = approvalInput.safeParse(args);
  if (!input.success) throw new HttpError(400, "Invalid proposal approval");
  try {
    const { goalId } = await createGoalFromProposal({ userId: context.user.id, proposalId: input.data.proposalId,
      autonomy: input.data.autonomy, edits: { statement: input.data.statement } },
    fn => prisma.$transaction(tx => fn(tx as unknown as ProposalTx)));
    return { goalId };
  } catch (error) {
    if (error instanceof ProposalError) {
      const status = error.code === "not_found" ? 404 : error.code === "not_pending" ? 409 : 400;
      throw new HttpError(status, "Proposal could not be approved");
    }
    throw error;
  }
}

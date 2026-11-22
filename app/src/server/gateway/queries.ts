import { z } from "zod";
import { RequestOriginSchema } from "../../shared/contracts";

// Argument validation and filters for the approvals and activity operations
// (src/features/approvals/operations.ts, src/features/activity/operations.ts). Kept here, free of
// Wasp imports, so it can be unit-tested. Every query is scoped to the signed-in user.

const id = z.string().min(1).max(200);

export const PendingApprovalsArgs = z.object({ goalId: id.optional() }).strict();
export const ApprovalByIdArgs = z.object({ approvalId: id }).strict();

/** Client-side decisions. Voice decisions arrive through the WP9 webhook, which calls gateway.decideApproval directly. */
export const DecideApprovalArgs = z
  .object({
    approvalId: id,
    decision: z.enum(["approve", "deny"]),
    via: z.enum(["web", "thread"]).default("web"),
  })
  .strict();

export const ACTIVITY_PAGE_SIZE = 50;

export const ActivityFilters = z
  .object({
    goalId: id.optional(),
    decision: z.enum(["ALLOW", "DENY", "NEEDS_APPROVAL"]).optional(),
    /** Shortcut for the activity page's "denied only" toggle. */
    deniedOnly: z.boolean().optional(),
    actionType: z.string().min(1).max(100).optional(),
    ruleId: z.string().min(1).max(100).optional(),
    origin: RequestOriginSchema.optional(),
    since: z.coerce.date().optional(),
    until: z.coerce.date().optional(),
    /** Id of the last row of the previous page. */
    cursor: id.optional(),
    limit: z.number().int().min(1).max(200).default(ACTIVITY_PAGE_SIZE),
  })
  .strict();
export type ActivityFilters = z.infer<typeof ActivityFilters>;

/** Prisma `where` for ActionLog: always the user's own rows, narrowed by the filters. */
export function activityWhere(userId: string, filters: ActivityFilters) {
  const decision = filters.deniedOnly ? "DENY" : filters.decision;
  return {
    userId,
    ...(filters.goalId ? { goalId: filters.goalId } : {}),
    ...(decision ? { decision } : {}),
    ...(filters.actionType ? { actionType: filters.actionType } : {}),
    ...(filters.ruleId ? { ruleId: filters.ruleId } : {}),
    ...(filters.origin ? { origin: filters.origin } : {}),
    ...(filters.since || filters.until
      ? { ts: { ...(filters.since ? { gte: filters.since } : {}), ...(filters.until ? { lte: filters.until } : {}) } }
      : {}),
  };
}

/** Splits one extra fetched row into a next-page cursor. */
export function pageOf<T extends { id: string }>(rows: T[], limit: number): { rows: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { rows, nextCursor: null };
  const page = rows.slice(0, limit);
  return { rows: page, nextCursor: page[page.length - 1]!.id };
}

/** Parses operation args or returns a message for a 400. */
export function parseArgs<S extends z.ZodType>(schema: S, args: unknown): { ok: true; data: z.infer<S> } | { ok: false; message: string } {
  const parsed = schema.safeParse(args ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, message: `invalid arguments: ${issue?.path.join(".") || "(root)"}: ${issue?.message}` };
}

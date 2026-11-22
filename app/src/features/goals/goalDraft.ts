import { z } from "zod";

// Goal drafts and creation (docs/IMPLEMENTATION_PLAN.md WP5 step 2, and the WP11 entry point).
// Framework-free: the Wasp action passes a Prisma transaction in as `tx`.

export const GOAL_KINDS = ["customers", "investors", "manufacturer", "supplier", "intern", "employer"] as const;
export const GOAL_DIRECTIONS = ["SELL", "BUY", "WORK_FOR"] as const;
export const AUTONOMY = ["WATCH", "PREPARE", "ACT"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];
export type GoalDirection = (typeof GOAL_DIRECTIONS)[number];
export type Autonomy = (typeof AUTONOMY)[number];

/** Which way the goal points, from what the user is looking for. */
export const DIRECTION_FOR_KIND: Record<GoalKind, GoalDirection> = {
  customers: "SELL",
  investors: "SELL",
  manufacturer: "BUY",
  supplier: "BUY",
  intern: "BUY",
  employer: "WORK_FOR",
};

/** Matches the company.search payload (gateway/handlers/discovery.ts), so the ICP can be sent as-is. */
export const CompanySearchIcp = z.object({
  keywords: z.array(z.string().min(1)).max(20).optional(),
  industries: z.array(z.string().min(1)).max(10).optional(),
  countryCodes: z.array(z.string().length(3)).max(10).optional(),
  employeeCount: z.object({ min: z.number().int().min(1).optional(), max: z.number().int().min(1).optional() }).optional(),
  pageSize: z.number().int().min(1).max(25).optional(),
});

export const GoalIcp = z.object({
  companySearch: CompanySearchIcp.optional(),
  /** Title words for contact.search at each match. Intern goals have none (step 5). */
  roles: z.array(z.string().min(1)).max(10).optional(),
});

export const GoalRules = z.object({
  dailyCap: z.number().int().min(0).max(100).default(10),
  quietHours: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/), tz: z.string() }).optional(),
});

export const GoalDraft = z
  .object({
    kind: z.enum(GOAL_KINDS),
    direction: z.enum(GOAL_DIRECTIONS).optional(),
    statement: z.string().trim().min(5).max(500),
    icp: GoalIcp.default({}),
    autonomy: z.enum(AUTONOMY).default("PREPARE"),
    rules: GoalRules.default({ dailyCap: 10 }),
  })
  .transform((g) => ({ ...g, direction: g.direction ?? DIRECTION_FOR_KIND[g.kind] }));
export type GoalDraft = z.output<typeof GoalDraft>;

/** Intern goals target private individuals: no contact.search (the gateway's `individuals` rule). */
export function needsContactSearch(draft: Pick<GoalDraft, "kind">): boolean {
  return draft.kind !== "intern";
}

// ---------- creating a goal from a meeting NeedProposal (WP11 → WP5) ----------

export interface ProposalTx {
  needProposal: {
    findFirst(args: { where: { id: string; userId: string } }): Promise<{ id: string; userId: string; status: string; proposedGoal: unknown } | null>;
    updateMany(args: { where: { id: string; userId: string; status: "PENDING" }; data: { status: "APPROVED" } }): Promise<{ count: number }>;
  };
  goal: {
    create(args: {
      data: { userId: string; kind: GoalKind; direction: GoalDirection; statement: string; icp: unknown; autonomy: Autonomy; rules: unknown };
    }): Promise<{ id: string }>;
  };
}

export class ProposalError extends Error {
  constructor(
    readonly code: "not_found" | "not_pending" | "invalid_goal",
    message: string,
  ) {
    super(message);
    this.name = "ProposalError";
  }
}

/**
 * Approves a pending NeedProposal and creates its goal in one transaction. Only the proposal's owner
 * can approve it, only once, at the autonomy they pick. Edits from the review card override the proposal.
 */
export async function createGoalFromProposal(
  input: { userId: string; proposalId: string; autonomy: Autonomy; edits?: Partial<z.input<typeof GoalDraft>> },
  transaction: <T>(fn: (tx: ProposalTx) => Promise<T>) => Promise<T>,
): Promise<{ goalId: string; draft: GoalDraft }> {
  return transaction(async (tx) => {
    const proposal = await tx.needProposal.findFirst({ where: { id: input.proposalId, userId: input.userId } });
    if (!proposal) throw new ProposalError("not_found", "No such proposal for this user.");
    if (proposal.status !== "PENDING") throw new ProposalError("not_pending", `Proposal is ${proposal.status}.`);

    const parsed = GoalDraft.safeParse({ ...(proposal.proposedGoal as object), ...input.edits, autonomy: input.autonomy });
    if (!parsed.success) throw new ProposalError("invalid_goal", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

    // Conditional update guards against a double approval racing this one.
    const { count } = await tx.needProposal.updateMany({ where: { id: proposal.id, userId: input.userId, status: "PENDING" }, data: { status: "APPROVED" } });
    if (count !== 1) throw new ProposalError("not_pending", "Proposal was decided by another request.");

    const draft = parsed.data;
    const goal = await tx.goal.create({
      data: { userId: input.userId, kind: draft.kind, direction: draft.direction, statement: draft.statement, icp: draft.icp, autonomy: draft.autonomy, rules: draft.rules },
    });
    return { goalId: goal.id, draft };
  });
}

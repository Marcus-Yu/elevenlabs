import { z } from "zod";

export const goalProposal = z.object({
  statement: z.string().trim().min(5).max(500),
  kind: z.enum(["hiring", "customers", "investors", "manufacturer", "supplier", "intern", "employer"]),
});
export type GoalProposal = z.infer<typeof goalProposal>;

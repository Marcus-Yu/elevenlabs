import { z } from "zod";

// Gateway contract (docs/IMPLEMENTATION_PLAN.md §7). Owned by WP0; import, don't redefine.

export const ACTION_TYPES = [
  "company.search",
  "jobs.search",
  "contact.search",
  "contact.reveal_email",
  "web.read",
  "match.submit",
  "draft.create",
  "outreach.send",
  "call.place",
  "memory.read",
  "memory.write",
  "memory.delete",
  "meeting.listen",
  "card.publish",
  "card.reveal",
] as const;

export const ActionTypeSchema = z.enum(ACTION_TYPES);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActorSchema = z.object({
  kind: z.enum(["user", "agent", "schedule"]),
  id: z.string().min(1),
});
export type Actor = z.infer<typeof ActorSchema>;

export const RequestOriginSchema = z.enum(["thread", "watcher", "voice", "meeting", "ui", "system"]);
export type RequestOrigin = z.infer<typeof RequestOriginSchema>;

export const ActionRequestSchema = z.object({
  actionType: ActionTypeSchema,
  userId: z.string().min(1),
  goalId: z.string().min(1).optional(),
  actor: ActorSchema,
  origin: RequestOriginSchema,
  /** True when the requester's context contained UntrustedText. */
  tainted: z.boolean(),
  /** Validated per actionType by the gateway. */
  payload: z.unknown(),
});
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export const DecisionSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("allow"), ruleId: z.string() }),
  z.object({ outcome: z.literal("deny"), ruleId: z.string(), reason: z.string() }),
  z.object({ outcome: z.literal("needs_approval"), ruleId: z.string(), approvalId: z.string() }),
]);
export type Decision = z.infer<typeof DecisionSchema>;

export const GatewayResultSchema = z.object({
  decision: DecisionSchema,
  logId: z.string(),
  data: z.unknown().optional(),
});
export interface GatewayResult<T = unknown> {
  decision: Decision;
  logId: string;
  data?: T;
}

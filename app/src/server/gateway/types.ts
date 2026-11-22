import type { z } from "zod";
import type { ActionType, Actor, RequestOrigin } from "../../shared/contracts";

// Handler registration interface (WP1). Other packages implement handlers in
// src/server/gateway/handlers/ and register them in handlers/index.ts. The engine validates the
// payload with `handler.payload`, runs the §8 rules, writes the ActionLog row and only then calls
// `run`. Handlers never decide permission.

export interface HandlerContext {
  userId: string;
  goalId?: string;
  actor: Actor;
  origin: RequestOrigin;
  /** Set when this run executes an approved request (Approval.id). */
  approvalId?: string;
  /** Set by the sandbox rule for outreach.send: the payload recipient was rewritten. */
  recipientRewrite?: { from: string; to: string };
  /** Set for card.publish: fields the gateway stripped as not allowed for matching. The payload no longer has them. */
  strippedFields?: { field: string; factKey: string | null; why: string }[];
}

export interface HandlerResult<T = unknown> {
  data: T;
  /** Written to ActionLog.reason, e.g. "untrusted_instruction_detected: ...". */
  logReason?: string;
}

export interface Handler<P extends z.ZodType = z.ZodType, T = unknown> {
  payload: P;
  // Method syntax on purpose: a handler typed for its own payload is assignable to Handler.
  run(payload: z.infer<P>, ctx: HandlerContext): Promise<HandlerResult<T>>;
}

/** One handler per action type. Spread later maps over earlier ones to replace a stub. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HandlerMap = Partial<Record<ActionType, Handler<any, any>>>;

/** Identity helper: checks a handler against Handler<P, T> with typed (payload, ctx). */
export function defineHandler<P extends z.ZodType, T>(handler: Handler<P, T>): Handler<P, T> {
  return handler;
}

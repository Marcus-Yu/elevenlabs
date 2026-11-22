import type { ActionRequest, Actor, GatewayResult, RequestOrigin } from "../../shared/contracts";
import { canonicalJson, hashApprovalPayload } from "./payloadHash";
import { buildRuleInput } from "./ruleInput";
import { resolveAllow } from "./rules/allow";
import { evaluateRules } from "./rules/index";
import type { GatewayEnv, RuleInput } from "./rules/types";
import type { GatewayStore, LogDecision } from "./store";
import type { Handler, HandlerContext } from "./types";
import type { HandlerRegistry } from "./registry";

// The decide-then-run steps shared by gateway.execute and approval execution. Every path through
// decideAndRun writes exactly one ActionLog row.

export interface GatewayDeps {
  store: GatewayStore;
  registry: HandlerRegistry;
  env: GatewayEnv;
  now?: () => Date;
}

/** Thrown when an allowed handler fails. The ActionLog row is already written. */
export class GatewayHandlerError extends Error {
  constructor(
    readonly logId: string,
    readonly actionType: string,
    readonly cause: unknown,
  ) {
    super(`${actionType} handler failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "GatewayHandlerError";
  }
}

/** Fields of a log row that come from the request; tolerant of requests that failed validation. */
export interface LogSubject {
  userId: string;
  goalId: string | null;
  actor: Actor;
  origin: RequestOrigin;
  actionType: string;
  payload?: unknown;
}

const SUMMARY_MAX = 500;
const STRING_MAX = 120;

/** A short, bounded view of the payload for ActionLog.inputSummary. Text is cut, never expanded. */
export function summarizePayload(payload: unknown, omitText = false): string | null {
  if (payload === undefined) return null;
  const shorten = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (omitText) return `[${value.length} chars]`;
      return value.length > STRING_MAX ? `${value.slice(0, STRING_MAX)}…` : value;
    }
    if (Array.isArray(value)) return value.map(shorten);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shorten(v)]));
    }
    return value;
  };
  const text = canonicalJson(shorten(payload));
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX)}…` : text;
}

export async function writeLog(
  deps: GatewayDeps,
  subject: LogSubject,
  decision: LogDecision,
  ruleId: string,
  reason: string | null,
  extra: { factIdsSent?: string[]; omitText?: boolean } = {},
): Promise<string> {
  const { id } = await deps.store.writeLog({
    userId: subject.userId,
    goalId: subject.goalId,
    actor: subject.actor,
    origin: subject.origin,
    actionType: subject.actionType,
    decision,
    ruleId,
    reason,
    inputSummary: summarizePayload(subject.payload, extra.omitText),
    factIdsSent: extra.factIdsSent ?? [],
    adapterMode: deps.env.adapterMode,
  });
  return id;
}

export async function denyResult(deps: GatewayDeps, subject: LogSubject, ruleId: string, reason: string, omitText = false): Promise<GatewayResult> {
  const logId = await writeLog(deps, subject, "DENY", ruleId, reason, { omitText });
  return { decision: { outcome: "deny", ruleId, reason }, logId };
}

export function subjectOf(request: ActionRequest): LogSubject {
  return {
    userId: request.userId,
    goalId: request.goalId ?? null,
    actor: request.actor,
    origin: request.origin,
    actionType: request.actionType,
    payload: request.payload,
  };
}

/**
 * Runs the §8 rules for a validated request, then creates an Approval, denies, or runs the handler.
 * In the "execute" phase (an approved Approval) only deny rules run and `approvalId` is passed on.
 */
export async function decideAndRun(
  deps: GatewayDeps,
  request: ActionRequest,
  handler: Handler,
  phase: RuleInput["phase"],
  approvalId?: string,
): Promise<GatewayResult> {
  const now = deps.now?.() ?? new Date();
  const input = await buildRuleInput(deps.store, request, phase, deps.env, now);
  // From here on use input.request: buildRuleInput may have stripped card fields from the payload.
  request = input.request;
  const subject = subjectOf(request);

  const hit = evaluateRules(input);
  if (hit?.rule.kind === "deny") {
    // Don't copy leaked private text into the log.
    return denyResult(deps, subject, hit.rule.id, hit.reason, hit.rule.id === "private_leak");
  }
  if (hit?.rule.kind === "approval") {
    const goalId = request.goalId ?? null;
    const approval = await deps.store.createApproval({
      userId: request.userId,
      goalId,
      actionType: request.actionType,
      payload: request.payload,
      payloadHash: hashApprovalPayload({ userId: request.userId, goalId, actionType: request.actionType, payload: request.payload }),
    });
    const logId = await writeLog(deps, subject, "NEEDS_APPROVAL", hit.rule.id, `${hit.reason} (approval ${approval.id})`);
    return { decision: { outcome: "needs_approval", ruleId: hit.rule.id, approvalId: approval.id }, logId };
  }

  const allow = resolveAllow(input);
  if (!allow.ok) return denyResult(deps, subject, allow.ruleId, allow.reason);

  const ctx: HandlerContext = {
    userId: request.userId,
    ...(request.goalId ? { goalId: request.goalId } : {}),
    actor: request.actor,
    origin: request.origin,
    ...(approvalId ? { approvalId } : {}),
    ...(allow.rewrite ? { recipientRewrite: allow.rewrite } : {}),
    ...(input.strippedFields.length > 0 ? { strippedFields: input.strippedFields } : {}),
  };
  const logged = { ...subject, payload: allow.payload };
  const factIdsSent = input.usedFactIds;
  let result;
  try {
    result = await handler.run(allow.payload, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const logId = await writeLog(deps, logged, "ALLOW", allow.ruleId, joinReasons(allow.reason, `handler_error: ${message}`), { factIdsSent });
    throw new GatewayHandlerError(logId, request.actionType, error);
  }
  const logId = await writeLog(deps, logged, "ALLOW", allow.ruleId, joinReasons(allow.reason, result.logReason ?? null), { factIdsSent });
  return { decision: { outcome: "allow", ruleId: allow.ruleId }, logId, data: result.data };
}

function joinReasons(...reasons: (string | null)[]): string | null {
  const present = reasons.filter((reason): reason is string => Boolean(reason));
  return present.length > 0 ? present.join("; ") : null;
}

import { autonomyPrepare } from "./autonomyPrepare";
import { autonomyWatch } from "./autonomyWatch";
import { callTarget } from "./callTarget";
import { consent } from "./consent";
import { dailyCap } from "./dailyCap";
import { firstContact } from "./firstContact";
import { individuals } from "./individuals";
import { introductions } from "./introductions";
import { needToKnow } from "./needToKnow";
import { optOut } from "./optOut";
import { ownership } from "./ownership";
import { paidReveal } from "./paidReveal";
import { personalization } from "./personalization";
import { privateLeak } from "./privateLeak";
import { taint } from "./taint";
import { taintedDraft } from "./taintedDraft";
import type { Rule } from "./types";

/**
 * §8 rules in evaluation order, after `schema` (engine) and before `sandbox`/`default`
 * (rules/allow.ts). Every deny rule comes before every approval rule, so the first approval hit
 * means the request passed all deny rules.
 */
export const RULES: readonly Rule[] = [
  ownership,
  consent,
  callTarget,
  individuals,
  taint,
  needToKnow,
  privateLeak,
  optOut,
  personalization,
  dailyCap,
  autonomyWatch,
  firstContact,
  taintedDraft,
  autonomyPrepare,
  introductions,
  paidReveal,
];

/** Rule ids the engine and approval lifecycle emit outside RULES. */
export const ENGINE_RULE_IDS = {
  schema: "schema",
  unknownAction: "unknown_action",
  sandbox: "sandbox",
  default: "default",
  payloadHash: "payload_hash",
  approvalState: "approval_state",
  approvalExpired: "approval_expired",
  userDenied: "user_denied",
  ownership: "ownership",
} as const;

/** First rule that fires, or null. In the execute phase approval rules are skipped. */
export function evaluateRules(input: Parameters<Rule["check"]>[0]): { rule: Rule; reason: string } | null {
  for (const rule of RULES) {
    if (input.phase === "execute" && rule.kind === "approval") continue;
    const reason = rule.check(input);
    if (reason !== null) return { rule, reason };
  }
  return null;
}

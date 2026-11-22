import type { OutreachSendPayload } from "../payloads";
import { CARD_FIELDS_RULE_ID, describeStripped } from "./cardFields";
import type { RuleInput } from "./types";

export type AllowResult =
  | { ok: true; ruleId: "sandbox" | "default" | "card_fields"; payload: unknown; reason: string | null; rewrite?: { from: string; to: string } }
  | { ok: false; ruleId: "sandbox" | "card_fields"; reason: string };

/**
 * §8 `card_fields`, `sandbox` and `default`, applied once every other rule passed. In sandbox mode (anything
 * other than OUTREACH_MODE=live) an outreach.send recipient is rewritten to OUTREACH_REDIRECT_TO.
 * Without a redirect address the send is refused rather than delivered to the real recipient.
 */
export function resolveAllow(input: RuleInput): AllowResult {
  const { request, env } = input;
  if (input.strippedFields.length > 0) {
    // card.publish: the payload is already stripped (ruleInput.ts); record what was removed.
    const remaining = Object.keys((request.payload as { fields: Record<string, string> }).fields).length;
    if (remaining === 0) return { ok: false, ruleId: CARD_FIELDS_RULE_ID, reason: `${describeStripped(input.strippedFields)}; no fields left to publish` };
    return { ok: true, ruleId: CARD_FIELDS_RULE_ID, payload: request.payload, reason: describeStripped(input.strippedFields) };
  }
  if (request.actionType !== "outreach.send" || env.outreachMode === "live") {
    return { ok: true, ruleId: "default", payload: request.payload, reason: null };
  }
  if (!env.redirectTo) return { ok: false, ruleId: "sandbox", reason: "OUTREACH_MODE is sandbox but OUTREACH_REDIRECT_TO is not set" };
  const payload = request.payload as OutreachSendPayload;
  return {
    ok: true,
    ruleId: "sandbox",
    payload: { ...payload, to: env.redirectTo },
    reason: `sandbox: recipient ${payload.to} rewritten to ${env.redirectTo}`,
    rewrite: { from: payload.to, to: env.redirectTo },
  };
}

import type { OutreachSendPayload } from "../payloads";
import type { RuleInput } from "./types";

export type AllowResult =
  | { ok: true; ruleId: "sandbox" | "default"; payload: unknown; reason: string | null; rewrite?: { from: string; to: string } }
  | { ok: false; ruleId: "sandbox"; reason: string };

/**
 * §8 `sandbox` and `default`, applied once every other rule passed. In sandbox mode (anything
 * other than OUTREACH_MODE=live) an outreach.send recipient is rewritten to OUTREACH_REDIRECT_TO.
 * Without a redirect address the send is refused rather than delivered to the real recipient.
 */
export function resolveAllow(input: RuleInput): AllowResult {
  const { request, env } = input;
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

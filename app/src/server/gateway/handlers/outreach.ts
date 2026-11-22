import { approveAndAwait, sendGmailViaAlter, type AlterConfig, type AlterIdentity, type AlterSendOutcome } from "../../adapters/alter";
import type { ExecutionBackend } from "../../execution/backend";
import { OutreachSendPayload } from "../payloads";
import { defineHandler, type HandlerContext, type HandlerMap, type HandlerResult } from "../types";

// outreach.send (WP7). The gateway has already decided: rules passed, the approval (if any) was
// granted in Atlas, and in sandbox mode the recipient was rewritten to OUTREACH_REDIRECT_TO. This
// handler only delivers. The double-opt-in introduction (card.reveal accepted by both sides) is
// sent through here like any other approved email.

export type GoalAutonomy = "WATCH" | "PREPARE" | "ACT";

export interface OutreachDeps {
  backend: ExecutionBackend;
  outreachMode: "sandbox" | "live";
  redirectTo: string | null;
  alter: AlterConfig;
  goalAutonomy(goalId: string): Promise<GoalAutonomy | null>;
  /** Stores Alter's approval id on our Approval row. */
  recordAlterApproval(approvalId: string, alterApprovalId: string): Promise<void>;
  send?: typeof sendGmailViaAlter;
  approve?: typeof approveAndAwait;
}

export type OutreachResult =
  | { delivered: false; backend: "local"; to: string; originalRecipient?: string }
  | ({ backend: "alter"; to: string; identity: AlterIdentity; originalRecipient?: string } & (
      | { delivered: true; alterApprovalId: string | null; gmailMessageId: string | null }
      | { delivered: false; alterApprovalId: string; approvalUrl: string; expiresAt: string }
    ));

/** Autonomy picks the credential: Watch has no Alter identity, so it cannot send at all. */
export function identityFor(autonomy: GoalAutonomy | null): AlterIdentity {
  if (autonomy === "WATCH") throw new Error("watch-level goals have no Alter identity and cannot send");
  return autonomy === "ACT" ? "atlas-act" : "atlas-prepare";
}

/** Defence in depth for rule 1: in sandbox mode only the redirect inbox may receive mail. */
export function assertSandboxRecipient(deps: Pick<OutreachDeps, "outreachMode" | "redirectTo">, to: string): void {
  if (deps.outreachMode !== "sandbox") return;
  if (!deps.redirectTo) throw new Error("OUTREACH_REDIRECT_TO is not set; sandbox sends are refused");
  if (to.toLowerCase() !== deps.redirectTo.toLowerCase()) throw new Error("sandbox send to a recipient other than OUTREACH_REDIRECT_TO refused");
}

async function sendThroughAlter(deps: OutreachDeps, payload: OutreachSendPayload, ctx: HandlerContext, identity: AlterIdentity): Promise<AlterSendOutcome> {
  const send = deps.send ?? sendGmailViaAlter;
  const approve = deps.approve ?? approveAndAwait;
  const context: Record<string, string> = { atlas_draft_id: payload.draftId, ...(ctx.approvalId ? { atlas_approval_id: ctx.approvalId } : {}) };
  const outcome = await send(deps.alter, {
    identity,
    message: { to: payload.to, subject: payload.subject, body: payload.body },
    reason: `Atlas outreach.send for draft ${payload.draftId}`,
    context,
  });
  if (outcome.status === "sent" || !ctx.approvalId) return outcome;
  // Alter held the send (atlas-prepare). The user already approved this exact payload in Atlas,
  // so record their decision in Alter and wait for Alter to execute it.
  await deps.recordAlterApproval(ctx.approvalId, outcome.alterApprovalId);
  if (!deps.alter.approverEmail) return outcome;
  return approve(deps.alter, { identity, alterApprovalId: outcome.alterApprovalId, actorEmail: deps.alter.approverEmail });
}

export function createOutreachHandlers(deps: OutreachDeps): HandlerMap {
  return {
    "outreach.send": defineHandler({
      payload: OutreachSendPayload,
      run: async (payload, ctx): Promise<HandlerResult<OutreachResult>> => {
        assertSandboxRecipient(deps, payload.to);
        const rewrite = ctx.recipientRewrite ? { originalRecipient: ctx.recipientRewrite.from } : {};
        if (deps.backend === "local") {
          const data: OutreachResult = { delivered: false, backend: "local", to: payload.to, ...rewrite };
          return { data, logReason: "local backend: email not sent (development only)" };
        }
        const identity = identityFor(ctx.goalId ? await deps.goalAutonomy(ctx.goalId) : null);
        const outcome = await sendThroughAlter(deps, payload, ctx, identity);
        const base = { backend: "alter" as const, to: payload.to, identity, ...rewrite };
        if (outcome.status === "sent") {
          const data: OutreachResult = { ...base, delivered: true, alterApprovalId: outcome.alterApprovalId, gmailMessageId: outcome.gmailMessageId };
          return { data, logReason: `sent through Alter as ${identity}` };
        }
        const data: OutreachResult = { ...base, delivered: false, alterApprovalId: outcome.alterApprovalId, approvalUrl: outcome.approvalUrl, expiresAt: outcome.expiresAt };
        return { data, logReason: `held by Alter for approval ${outcome.alterApprovalId}` };
      },
    }),
  };
}

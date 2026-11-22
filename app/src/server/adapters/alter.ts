import { Agent, App, PendingApproval } from "@alter-ai/alter-sdk";

// Alter adapter (WP7). Coded to docs.alterauth.com and @alter-ai/alter-sdk 0.33 type definitions;
// not yet verified against a live Alter app (no credentials at time of writing). Only
// gateway/handlers/ may import this file (AGENTS.md rule 2). The Gmail credential stays in Alter:
// the request goes through Alter's proxy with the Google grant, never through our process.

/** The two Alter agent identities. Watch-level goals and remote agents get neither. */
export type AlterIdentity = "atlas-prepare" | "atlas-act";

export interface AlterConfig {
  appKey: string | null;
  agentKeys: Record<AlterIdentity, string | null>;
  googleGrantId: string | null;
  /** The approver's email as registered in Alter; Atlas asserts it when the user approves in Atlas. */
  approverEmail: string | null;
}

export function alterConfigFrom(env: NodeJS.ProcessEnv = process.env): AlterConfig {
  const value = (key: string) => env[key]?.trim() || null;
  return {
    appKey: value("ALTER_API_KEY"),
    agentKeys: { "atlas-prepare": value("ALTER_AGENT_KEY_PREPARE"), "atlas-act": value("ALTER_AGENT_KEY_ACT") },
    googleGrantId: value("ALTER_GOOGLE_GRANT_ID"),
    approverEmail: value("ALTER_APPROVER_EMAIL"),
  };
}

export const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export interface GmailMessage {
  to: string;
  subject: string;
  body: string;
}

/** RFC 2822 plain-text message, base64url-encoded as Gmail's `raw` field expects. */
export function encodeGmailRaw(message: GmailMessage): string {
  const subject = /^[\x20-\x7e]*$/.test(message.subject)
    ? message.subject
    : `=?UTF-8?B?${Buffer.from(message.subject, "utf8").toString("base64")}?=`;
  const lines = [
    `To: ${message.to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    message.body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export type AlterSendOutcome =
  | { status: "sent"; alterApprovalId: string | null; providerStatus: number; gmailMessageId: string | null }
  | { status: "pending"; alterApprovalId: string; approvalUrl: string; expiresAt: string };

export interface AlterSendInput {
  identity: AlterIdentity;
  message: GmailMessage;
  /** Shown to the approver in Alter. Ids only, no private values. */
  reason: string;
  /** Our Approval id or draft id, so a retried send is not delivered twice. */
  context: Record<string, string>;
}

function requireKey(value: string | null, name: string): string {
  if (!value) throw new Error(`${name} is not set; see docs/ALTER_SETUP.md`);
  return value;
}

function agentFor(config: AlterConfig, identity: AlterIdentity): Agent {
  const key = identity === "atlas-act" ? "ALTER_AGENT_KEY_ACT" : "ALTER_AGENT_KEY_PREPARE";
  return new Agent({ apiKey: requireKey(config.agentKeys[identity], key) });
}

function gmailMessageId(bodyB64: string): string | null {
  try {
    const parsed = JSON.parse(Buffer.from(bodyB64, "base64").toString("utf8")) as { id?: unknown };
    return typeof parsed.id === "string" ? parsed.id : null;
  } catch {
    return null;
  }
}

/** Sends one Gmail message through Alter's proxy. Alter may hold it for approval. */
export async function sendGmailViaAlter(config: AlterConfig, input: AlterSendInput): Promise<AlterSendOutcome> {
  const agent = agentFor(config, input.identity);
  try {
    const result = await agent.proxyRequest({
      method: "POST",
      url: GMAIL_SEND_URL,
      ...(config.googleGrantId ? { grantId: config.googleGrantId } : { provider: "google" }),
      json: { raw: encodeGmailRaw(input.message) },
      reason: input.reason,
      context: input.context,
    });
    if (result instanceof PendingApproval) {
      return { status: "pending", alterApprovalId: result.approvalId, approvalUrl: result.approvalUrl, expiresAt: result.expiresAt.toISOString() };
    }
    if (result.statusCode >= 400) throw new Error(`Gmail send through Alter failed with HTTP ${result.statusCode}`);
    return { status: "sent", alterApprovalId: result.approvalId, providerStatus: result.statusCode, gmailMessageId: gmailMessageId(result.bodyB64) };
  } finally {
    await agent.close();
  }
}

/**
 * The user approved in Atlas: record that decision in Alter as the user, then wait for Alter to
 * execute the held send. Throws ApprovalDeniedError, ApprovalExpiredError, ApprovalTimeoutError or
 * ApprovalExecutionFailedError; the gateway logs the error as handler_error.
 */
export async function approveAndAwait(
  config: AlterConfig,
  input: { identity: AlterIdentity; alterApprovalId: string; actorEmail: string; timeoutMs?: number },
): Promise<AlterSendOutcome> {
  const app = new App({ apiKey: requireKey(config.appKey, "ALTER_API_KEY") });
  const agent = agentFor(config, input.identity);
  try {
    const status = await app.getApprovalStatus(input.alterApprovalId);
    await app.decideApproval(input.alterApprovalId, {
      decision: "approved",
      actorEmail: input.actorEmail,
      summaryVersion: status.summaryVersion,
    });
    const result = await agent.awaitApproval(input.alterApprovalId, { timeoutMs: input.timeoutMs ?? 60_000 });
    return { status: "sent", alterApprovalId: input.alterApprovalId, providerStatus: result.statusCode, gmailMessageId: gmailMessageId(result.bodyB64) };
  } finally {
    await Promise.all([app.close(), agent.close()]);
  }
}

import type { ActionRequest } from "../../../shared/contracts";
import type { ConsentKind, DraftSnapshot, FactSnapshot, GoalSnapshot, MatchSnapshot, UserSnapshot } from "../store";

export interface GatewayEnv {
  /** Anything other than "live" is treated as sandbox. */
  outreachMode: "sandbox" | "live";
  /** Where every outreach recipient is rewritten to in sandbox mode. */
  redirectTo: string | null;
  adapterMode: "live" | "record" | "replay";
}

/**
 * Everything a rule may look at, loaded once by the engine. Rules are pure functions of this.
 * `request.payload` has already passed the handler's schema and the core payload contract.
 */
export interface RuleInput {
  request: ActionRequest;
  /** "request": a new call; "execute": running an approved Approval (only deny rules run). */
  phase: "request" | "execute";
  goal: GoalSnapshot | null;
  user: UserSnapshot | null;
  consents: ReadonlySet<ConsentKind>;
  /** The user's profile facts. Loaded for actions that send text or use facts. */
  facts: FactSnapshot[];
  /** ProfileFact ids this action hands to a model (draft.create). */
  usedFactIds: string[];
  /** Text that leaves the workspace (draft text, email subject and body, share card fields). */
  outgoingText: string[];
  /** Every string in a provider-bound or watcher payload (provider_minimum). */
  providerText: string[];
  /** Lower-cased email recipient for outreach.send. */
  recipient: string | null;
  recipientOptedOut: boolean;
  /** outreach.send: the draft named in the payload. */
  draft: DraftSnapshot | null;
  /** draft.create: the match named in the payload. */
  match: MatchSnapshot | null;
  /** contact.reveal_email: the goal's match for the payload's company. */
  revealMatch: MatchSnapshot | null;
  sendsToday: number;
  priorApprovedSend: boolean;
  env: GatewayEnv;
}

export interface Rule {
  id: string;
  /** deny: a hit refuses the request. approval: a hit creates an Approval (request phase only). */
  kind: "deny" | "approval";
  /** Returns the reason when the rule fires, or null to pass. */
  check(input: RuleInput): string | null;
}

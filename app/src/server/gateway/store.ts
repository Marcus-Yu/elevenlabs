import type { Actor, RequestOrigin } from "../../shared/contracts";

// The data the gateway reads and writes, behind an interface so the engine and rules can be
// unit-tested without a database. prismaStore.ts implements it for the app; memoryStore.ts for tests.

export type GoalStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
export type Autonomy = "WATCH" | "PREPARE" | "ACT";
export type ConsentKind = "model_processing" | "meeting_listening" | "phone_calls" | "matching" | "identity_reveal";
export type ApprovalStatus = "PENDING" | "APPROVED" | "DENIED" | "EXPIRED" | "EXECUTED" | "FAILED";
export type DecisionChannel = "web" | "thread" | "voice";
export type LogDecision = "ALLOW" | "DENY" | "NEEDS_APPROVAL";
export type AdapterMode = "live" | "record" | "replay";

export interface GoalSnapshot {
  id: string;
  userId: string;
  status: GoalStatus;
  kind: string;
  autonomy: Autonomy;
  /** Goal.rules json: { dailyCap?: number, quietHours?: ... } */
  rules: unknown;
}

export interface UserSnapshot {
  id: string;
  phone: string | null;
  phoneVerifiedAt: Date | null;
}

export interface FactSnapshot {
  id: string;
  key: string;
  value: string;
  sensitivity: "public" | "shareable" | "private";
  allowedPurposes: string[];
}

export type MatchStatus = "NEW" | "VETTED" | "APPROVED" | "REJECTED" | "CONTACTED";

export interface MatchSnapshot {
  id: string;
  goalId: string;
  status: MatchStatus;
}

export interface SourceRefSnapshot {
  id: string;
  matchId: string;
  provider: "fiber" | "ploid" | "web";
}

export interface PersonRef {
  email?: string;
  linkedinUrl?: string;
  fullName?: string;
  companyDomain?: string;
}

export interface DraftSnapshot {
  id: string;
  matchId: string;
  /** The goal of the draft's match. */
  goalId: string;
  version: number;
  personalizationRefs: string[];
  /** The SourceRef rows named in personalizationRefs that exist. */
  refs: SourceRefSnapshot[];
}

export interface ApprovalRecord {
  id: string;
  userId: string;
  goalId: string | null;
  actionType: string;
  payload: unknown;
  payloadHash: string;
  status: ApprovalStatus;
  decidedVia: DecisionChannel | null;
  decidedAt: Date | null;
  createdAt: Date;
}

export interface NewApproval {
  userId: string;
  goalId: string | null;
  actionType: string;
  payload: unknown;
  payloadHash: string;
}

export interface ApprovalPatch {
  status: ApprovalStatus;
  decidedVia?: DecisionChannel;
  decidedAt?: Date;
}

export interface LogEntry {
  userId: string;
  goalId: string | null;
  actor: Actor;
  origin: RequestOrigin;
  actionType: string;
  decision: LogDecision;
  ruleId: string;
  reason: string | null;
  inputSummary: string | null;
  factIdsSent: string[];
  adapterMode: AdapterMode | null;
  /** TraceRoot trace id, set by the WP7 log stamp when tracing is on. */
  traceId?: string | null;
}

export interface GatewayStore {
  getGoal(goalId: string): Promise<GoalSnapshot | null>;
  getUser(userId: string): Promise<UserSnapshot | null>;
  activeConsents(userId: string): Promise<ConsentKind[]>;
  /** All profile facts of the user. */
  getUserFacts(userId: string): Promise<FactSnapshot[]>;
  getMatch(matchId: string): Promise<MatchSnapshot | null>;
  /** The goal's match for the company with this domain. */
  findMatchByDomain(goalId: string, domain: string): Promise<MatchSnapshot | null>;
  getDraft(draftId: string): Promise<DraftSnapshot | null>;
  /** True when the lower-cased address or its domain is in OptOut. */
  isOptedOut(email: string): Promise<boolean>;
  /**
   * True when the person is a Contact on one of the user's `hire` goal matches, i.e. found by
   * research. Matches by email, LinkedIn URL, or full name plus company domain (all case-insensitive).
   */
  isResearchedCandidate(userId: string, person: PersonRef): Promise<boolean>;
  /** Allowed outreach.send log rows for the goal since `since`. */
  countAllowedSends(goalId: string, since: Date): Promise<number>;
  /** True when the user has an approved or executed outreach.send to this recipient. */
  hasApprovedSendTo(userId: string, recipient: string): Promise<boolean>;

  createApproval(data: NewApproval): Promise<ApprovalRecord>;
  getApproval(approvalId: string): Promise<ApprovalRecord | null>;
  /** Compare-and-set: applies the patch only when the status is one of `from`. Returns whether it applied. */
  transitionApproval(approvalId: string, from: ApprovalStatus[], patch: ApprovalPatch): Promise<boolean>;

  writeLog(entry: LogEntry): Promise<{ id: string }>;
}

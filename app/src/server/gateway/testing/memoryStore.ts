import type {
  ApprovalPatch,
  ApprovalRecord,
  ApprovalStatus,
  ConsentKind,
  DraftSnapshot,
  FactSnapshot,
  GatewayStore,
  GoalSnapshot,
  LogEntry,
  MatchSnapshot,
  NewApproval,
  SourceRefSnapshot,
  UserSnapshot,
} from "../store";

/** In-memory GatewayStore for unit tests (here and in other packages). Not used by the app. */
export class MemoryGatewayStore implements GatewayStore {
  goals = new Map<string, GoalSnapshot>();
  users = new Map<string, UserSnapshot>();
  consents = new Map<string, ConsentKind[]>();
  facts = new Map<string, FactSnapshot[]>();
  matches = new Map<string, MatchSnapshot>();
  drafts = new Map<string, Omit<DraftSnapshot, "refs">>();
  sourceRefs = new Map<string, SourceRefSnapshot>();
  optOuts = new Set<string>();
  approvals = new Map<string, ApprovalRecord>();
  logs: (LogEntry & { id: string; ts: Date })[] = [];
  private seq = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async getGoal(goalId: string) {
    return this.goals.get(goalId) ?? null;
  }
  async getUser(userId: string) {
    return this.users.get(userId) ?? null;
  }
  async activeConsents(userId: string) {
    return this.consents.get(userId) ?? [];
  }
  async getUserFacts(userId: string) {
    return this.facts.get(userId) ?? [];
  }
  async getMatch(matchId: string) {
    return this.matches.get(matchId) ?? null;
  }
  async getDraft(draftId: string) {
    const draft = this.drafts.get(draftId);
    if (!draft) return null;
    const refs = draft.personalizationRefs.flatMap((id) => this.sourceRefs.get(id) ?? []);
    return { ...draft, refs };
  }
  async isOptedOut(email: string) {
    const lower = email.toLowerCase();
    return this.optOuts.has(lower) || this.optOuts.has(lower.split("@")[1] ?? "");
  }
  async countAllowedSends(goalId: string, since: Date) {
    return this.logs.filter((l) => l.goalId === goalId && l.actionType === "outreach.send" && l.decision === "ALLOW" && l.ts >= since).length;
  }
  async hasApprovedSendTo(userId: string, recipient: string) {
    return [...this.approvals.values()].some(
      (a) =>
        a.userId === userId &&
        a.actionType === "outreach.send" &&
        (a.status === "APPROVED" || a.status === "EXECUTED") &&
        String((a.payload as { to?: unknown }).to ?? "").toLowerCase() === recipient,
    );
  }
  async createApproval(data: NewApproval) {
    const record: ApprovalRecord = {
      id: `approval_${++this.seq}`,
      ...data,
      payload: structuredClone(data.payload),
      status: "PENDING",
      decidedVia: null,
      decidedAt: null,
      createdAt: this.now(),
    };
    this.approvals.set(record.id, record);
    return { ...record };
  }
  async getApproval(approvalId: string) {
    const record = this.approvals.get(approvalId);
    return record ? { ...record, payload: structuredClone(record.payload) } : null;
  }
  async transitionApproval(approvalId: string, from: ApprovalStatus[], patch: ApprovalPatch) {
    const record = this.approvals.get(approvalId);
    if (!record || !from.includes(record.status)) return false;
    Object.assign(record, patch);
    return true;
  }
  async writeLog(entry: LogEntry) {
    const id = `log_${++this.seq}`;
    this.logs.push({ ...entry, id, ts: this.now() });
    return { id };
  }
}

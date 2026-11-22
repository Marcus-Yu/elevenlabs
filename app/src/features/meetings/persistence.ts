import type { GoalProposal, MeetingAccess } from "./need-detection";
import type { MeetingIdentity } from "./meeting-session";

/** Minimum Prisma transaction surface used by this adapter. */
export type MeetingTransaction = {
  consent: { findFirst(args: { where: { userId: string; kind: "meeting_listening"; scope: string }; orderBy: [{ grantedAt: "desc" }, { id: "desc" }]; select: { revokedAt: true } }): Promise<{ revokedAt: Date | null } | null> };
  needProposal: { create(args: { data: { userId: string; transcriptExcerpt: string; proposedGoal: GoalProposal["proposedGoal"]; status: "PENDING" } }): Promise<unknown> };
};
export type MeetingDatabase<Transaction extends MeetingTransaction> = {
  $transaction<T>(fn: (tx: Transaction) => Promise<T>, options: { isolationLevel: "Serializable" }): Promise<T>;
};
/** Must consult transactionally persisted active state for this exact identity, not client state. */
export type ActiveMeetingCheck<Transaction extends MeetingTransaction> =
  (tx: Transaction, identity: MeetingIdentity) => Promise<boolean>;

function validIdentity(identity: MeetingIdentity): boolean {
  return typeof identity.userId === "string" && identity.userId.length > 0 && identity.userId.length <= 256 &&
    typeof identity.meetingId === "string" && identity.meetingId.length > 0 && identity.meetingId.length <= 256;
}
function validProposal(p: GoalProposal): boolean {
  return typeof p?.transcriptExcerpt === "string" && !!p.transcriptExcerpt.trim() && p.transcriptExcerpt.length <= 500 &&
    typeof p.proposedGoal?.statement === "string" && !!p.proposedGoal.statement.trim() && p.proposedGoal.statement.length <= 500 &&
    ["SELL", "BUY", "WORK_FOR"].includes(p.proposedGoal.direction) &&
    ["customers", "investors", "manufacturer", "supplier", "intern", "employer"].includes(p.proposedGoal.kind);
}
async function allowed<Transaction extends MeetingTransaction>(
  tx: Transaction, identity: MeetingIdentity, isActive: ActiveMeetingCheck<Transaction>,
): Promise<boolean> {
  if (!validIdentity(identity)) return false;
  // The newest grant for this exact user/scope governs; an older grant cannot revive a revoked one.
  const consent = await tx.consent.findFirst({ where: { userId: identity.userId, kind: "meeting_listening", scope: identity.meetingId },
    orderBy: [{ grantedAt: "desc" }, { id: "desc" }], select: { revokedAt: true } });
  return consent !== null && consent.revokedAt === null && await isActive(tx, identity);
}

/**
 * The schema has no Meeting entity: exact userId/scope consent is the available
 * ownership boundary. A real transaction-backed active-meeting check is required;
 * no permissive default exists. Call only with identity derived from server auth.
 * Serializable conflicts/errors propagate and must never be treated as success.
 */
export function meetingPersistence<Transaction extends MeetingTransaction>(
  db: MeetingDatabase<Transaction>, isActive: ActiveMeetingCheck<Transaction>,
) {
  return {
    async access(identity: MeetingIdentity): Promise<MeetingAccess | null> {
      return db.$transaction(async tx => await allowed(tx, identity, isActive)
        ? { meetingId: identity.meetingId, active: true, consent: { kind: "meeting_listening", scope: identity.meetingId, granted: true } }
        : null, { isolationLevel: "Serializable" });
    },
    async saveIfAuthorized(identity: MeetingIdentity, proposal: GoalProposal): Promise<boolean> {
      if (!validIdentity(identity) || !validProposal(proposal)) return false;
      return db.$transaction(async tx => {
        if (!await allowed(tx, identity, isActive)) return false;
        // Construct a fresh payload so no transcript batch or extra model fields are stored.
        await tx.needProposal.create({ data: { userId: identity.userId, transcriptExcerpt: proposal.transcriptExcerpt,
          proposedGoal: { direction: proposal.proposedGoal.direction, kind: proposal.proposedGoal.kind, statement: proposal.proposedGoal.statement }, status: "PENDING" } });
        return true;
      }, { isolationLevel: "Serializable" });
    },
  };
}

import type { UntrustedText } from "../../shared/contracts/discovery";

/** A caller must establish current, meeting-scoped consent and active recording. */
export type MeetingAccess = {
  meetingId: string;
  active: boolean;
  consent: { kind: "meeting_listening"; scope: string; granted: boolean } | null;
};
export type CommittedSegment = { meetingId: string; committed: true; content: UntrustedText };
export type MeetingBatch = { meetingId: string; segments: readonly UntrustedText[] };
export type GoalProposal = {
  transcriptExcerpt: string;
  proposedGoal: {
    direction: "SELL" | "BUY" | "WORK_FOR";
    kind: "customers" | "investors" | "manufacturer" | "supplier" | "intern" | "employer";
    statement: string;
  };
};

export const BATCH_SIZE = 3;
export const MAX_SEGMENT_CHARS = 2000;
export const MAX_EXCERPT_CHARS = 500;

function authorized(access: MeetingAccess): boolean {
  return !!access.meetingId && access.active === true && access.consent?.granted === true &&
    access.consent.kind === "meeting_listening" && access.consent.scope === access.meetingId;
}

/** Return one bounded batch of committed transcript data, or null if not ready/authorized. */
export function makeBatch(access: MeetingAccess, segments: readonly CommittedSegment[]): MeetingBatch | null {
  if (!authorized(access) || segments.length < BATCH_SIZE) return null;
  const batch = segments.slice(0, BATCH_SIZE);
  if (batch.some(s => s.meetingId !== access.meetingId || s.committed !== true || s.content.kind !== "untrusted" ||
    typeof s.content.text !== "string" || !s.content.text.trim() || s.content.text.length > MAX_SEGMENT_CHARS)) return null;
  return { meetingId: access.meetingId, segments: batch.map(s => s.content) };
}

/** Parse classifier data into a proposal only; null means no valid proposal. */
export function parseProposal(access: MeetingAccess, batch: MeetingBatch, output: unknown): GoalProposal | null {
  if (!authorized(access) || batch.meetingId !== access.meetingId || batch.segments.length !== BATCH_SIZE ||
    batch.segments.some(s => s.kind !== "untrusted" || typeof s.text !== "string" || !s.text.trim() || s.text.length > MAX_SEGMENT_CHARS)) return null;
  if (typeof output !== "object" || output === null || Array.isArray(output)) return null;
  const { transcriptExcerpt, proposedGoal: goal } = output as Record<string, unknown>;
  if (typeof transcriptExcerpt !== "string" || !transcriptExcerpt.trim() ||
    transcriptExcerpt.length > MAX_EXCERPT_CHARS ||
    !batch.segments.some(segment => segment.text.includes(transcriptExcerpt)) ||
    typeof goal !== "object" || goal === null || Array.isArray(goal)) return null;
  const candidate = goal as Record<string, unknown>;
  if (typeof candidate.direction !== "string" || !["SELL", "BUY", "WORK_FOR"].includes(candidate.direction) ||
    typeof candidate.kind !== "string" || !["customers", "investors", "manufacturer", "supplier", "intern", "employer"].includes(candidate.kind) ||
    typeof candidate.statement !== "string" || !candidate.statement.trim() || candidate.statement.length > 500) return null;
  return { transcriptExcerpt, proposedGoal: {
    direction: candidate.direction as GoalProposal["proposedGoal"]["direction"],
    kind: candidate.kind as GoalProposal["proposedGoal"]["kind"], statement: candidate.statement,
  } };
}

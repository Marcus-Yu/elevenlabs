import { describe, expect, it } from "vitest";
import { makeBatch, parseProposal, type MeetingAccess, type CommittedSegment } from "./need-detection";

const access: MeetingAccess = { meetingId: "m1", active: true, consent: { kind: "meeting_listening", scope: "m1", granted: true } };
const segments: CommittedSegment[] = ["We need a contract manufacturer for the gripper housing.", "It must be reliable.", "Let's discuss timing."].map(text => ({
  meetingId: "m1", committed: true, content: { kind: "untrusted", text, flagged: false, source: { provider: "web", fetchedAt: "2026-01-01", claim: "transcript" } },
}));
const output = { transcriptExcerpt: "contract manufacturer for the gripper housing", proposedGoal: { direction: "BUY", kind: "manufacturer", statement: "Find a contract manufacturer" } };

describe("meeting need detection", () => {
  it("batches committed data and returns a proposal grounded in an exact excerpt", () => {
    const batch = makeBatch(access, segments)!;
    expect(batch.segments).toHaveLength(3);
    expect(parseProposal(access, batch, output)).toEqual(output);
  });
  it("rejects missing, mismatched or inactive consent and incomplete batches", () => {
    const batch = makeBatch(access, segments)!;
    for (const invalid of [{ ...access, consent: null }, { ...access, active: false }, { ...access, consent: { ...access.consent!, scope: "other" } }]) {
      expect(makeBatch(invalid, segments)).toBeNull();
      expect(parseProposal(invalid, batch, output)).toBeNull();
    }
    expect(makeBatch(access, segments.slice(0, 2))).toBeNull();
  });
  it("keeps batches and segments bound to their meeting", () => {
    const other = { ...access, meetingId: "m2", consent: { ...access.consent!, scope: "m2" } };
    const batch = makeBatch(access, segments)!;
    expect(makeBatch(other, segments)).toBeNull();
    expect(parseProposal(other, batch, output)).toBeNull();
  });
  it("rejects invented excerpts, invalid goals and oversized segments", () => {
    const batch = makeBatch(access, segments)!;
    expect(parseProposal(access, batch, { ...output, transcriptExcerpt: "invented" })).toBeNull();
    expect(parseProposal(access, batch, { ...output, proposedGoal: { ...output.proposedGoal, direction: "OTHER" } })).toBeNull();
    expect(makeBatch(access, [{ ...segments[0], content: { ...segments[0].content, text: "x".repeat(2001) } }, ...segments.slice(1)])).toBeNull();
    expect(parseProposal(access, batch, null)).toBeNull();
  });
});

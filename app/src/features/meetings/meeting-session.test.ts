import { describe, expect, it, vi } from "vitest";
import { startMeetingSession, approveMeetingProposal, type MeetingSessionPorts } from "./meeting-session";
import type { CommittedSegment } from "./need-detection";

const identity = { userId: "u1", meetingId: "m1" };
const access = { meetingId: "m1", active: true, consent: { kind: "meeting_listening" as const, scope: "m1", granted: true } };
const utterance = "We need a contract manufacturer for the gripper housing.";
function segment(text: string): CommittedSegment { return { meetingId: "m1", committed: true, content: { kind: "untrusted", text, flagged: false, source: { provider: "web", fetchedAt: "2026-01-01", claim: "transcript" } } }; }

describe("meeting session", () => {
  it("processes committed speech into a proposal and creates a goal only on explicit approval", async () => {
    let receive!: (s: CommittedSegment) => void;
    let resolveSaved!: () => void;
    const saved = new Promise<void>(resolve => { resolveSaved = resolve; });
    const save = vi.fn(async () => { resolveSaved(); return true; });
    const approve = vi.fn(async () => {});
    const ports: MeetingSessionPorts = { access: async () => access, subscribe: async (_, cb) => { receive = cb; return () => {}; }, classify: async () => ({ transcriptExcerpt: utterance, proposedGoal: { direction: "BUY", kind: "manufacturer", statement: "Find a manufacturer" } }), saveIfAuthorized: save, approvePending: approve };
    const session = await startMeetingSession(identity, ports, () => { throw new Error("unexpected"); });
    receive(segment(utterance)); receive(segment("It needs to be reliable.")); receive(segment("We should discuss timing."));
    await saved;
    expect(save).toHaveBeenCalledWith(identity, { transcriptExcerpt: utterance, proposedGoal: { direction: "BUY", kind: "manufacturer", statement: "Find a manufacturer" } });
    expect(approve).not.toHaveBeenCalled();
    await approveMeetingProposal(identity, "p1", { direction: "BUY", kind: "manufacturer", statement: "Find a manufacturer", autonomy: "PREPARE" }, ports);
    expect(approve).toHaveBeenCalledOnce();
    session.stop();
  });
  it("denies start without consent and never subscribes", async () => {
    const subscribe = vi.fn();
    const ports = { access: async () => ({ ...access, consent: null }), subscribe } as unknown as MeetingSessionPorts;
    await expect(startMeetingSession(identity, ports, () => {})).rejects.toThrow("access denied");
    expect(subscribe).not.toHaveBeenCalled();
  });
  it("does not save if consent is revoked during classification", async () => {
    let receive!: (s: CommittedSegment) => void;
    let allowed = true;
    let finish!: (value: unknown) => void;
    let classifyStarted!: () => void;
    const started = new Promise<void>(r => { classifyStarted = r; });
    const save = vi.fn(async () => true);
    const ports: MeetingSessionPorts = { access: async () => allowed ? access : null, subscribe: async (_, cb) => { receive = cb; return () => {}; }, classify: () => { classifyStarted(); return new Promise(r => { finish = r; }); }, saveIfAuthorized: save, approvePending: async () => {} };
    await startMeetingSession(identity, ports, () => {});
    receive(segment(utterance)); receive(segment("two")); receive(segment("three"));
    await started; allowed = false;
    finish({ transcriptExcerpt: utterance, proposedGoal: { direction: "BUY", kind: "manufacturer", statement: "Find one" } });
    await new Promise(r => setTimeout(r, 0));
    expect(save).not.toHaveBeenCalled();
  });
});

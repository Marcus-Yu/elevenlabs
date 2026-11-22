import { BATCH_SIZE, makeBatch, parseProposal, type CommittedSegment, type GoalProposal, type MeetingAccess } from "./need-detection";

export type MeetingIdentity = { userId: string; meetingId: string };
export type MeetingSessionPorts = {
  /** Must check ownership, current active status, and unrevoked consent for this exact meeting. */
  access(identity: MeetingIdentity): Promise<MeetingAccess | null>;
  /** Subscribe to committed segments; signal revocation, ownership loss or stop via onInvalidated. */
  subscribe(identity: MeetingIdentity, receive: (segment: CommittedSegment) => void, onInvalidated: () => void): Promise<() => void>;
  /** Treat batch content as untrusted data; do not place it in a system prompt. */
  classify(batch: ReturnType<typeof makeBatch> & {}): Promise<unknown>;
  /** Atomically recheck ownership, active status and unrevoked meeting consent before persisting only this proposal. */
  saveIfAuthorized(identity: MeetingIdentity, proposal: GoalProposal): Promise<boolean>;
  /** Server-side operation must atomically authorize owner, pending status and create the goal once. */
  approvePending(identity: MeetingIdentity, proposalId: string, selection: GoalProposal["proposedGoal"] & { autonomy: "WATCH" | "PREPARE" | "ACT" }): Promise<void>;
};

function isAuthorized(identity: MeetingIdentity, access: MeetingAccess | null): access is MeetingAccess {
  return !!identity.userId && !!identity.meetingId && access?.meetingId === identity.meetingId &&
    access.active === true && access.consent?.kind === "meeting_listening" &&
    access.consent.scope === identity.meetingId && access.consent.granted === true;
}

/** One bounded, serialized session. An access failure or processing error stops it. */
export async function startMeetingSession(identity: MeetingIdentity, ports: MeetingSessionPorts, onError: (error: unknown) => void) {
  if (!isAuthorized(identity, await ports.access(identity))) throw new Error("Meeting access denied");
  let running = true;
  let unsubscribe: (() => void) | undefined;
  let queue: CommittedSegment[] = [];
  let processing = false;
  const stop = () => {
    if (!running) return;
    running = false;
    queue = [];
    unsubscribe?.();
  };
  const drain = async () => {
    if (processing || !running) return;
    processing = true;
    try {
      while (running && queue.length >= BATCH_SIZE) {
        const current = await ports.access(identity);
        if (!running) break;
        if (!isAuthorized(identity, current)) { stop(); break; }
        const segments = queue.splice(0, BATCH_SIZE);
        const batch = makeBatch(current, segments);
        if (!batch) throw new Error("Invalid committed segment batch");
        const output = await ports.classify(batch);
        if (!running) break;
        const fresh = await ports.access(identity);
        if (!running) break;
        if (!isAuthorized(identity, fresh)) { stop(); break; }
        const proposal = parseProposal(fresh, batch, output);
        if (proposal && !(await ports.saveIfAuthorized(identity, proposal))) { stop(); break; }
      }
    } catch (error) {
      stop();
      onError(error);
    } finally {
      processing = false;
    }
  };
  const receive = (segment: CommittedSegment) => {
    if (!running) return;
    // Bound memory while a slow classifier is in flight; stop rather than silently lose data.
    if (queue.length >= BATCH_SIZE * 4) { stop(); onError(new Error("Meeting segment queue full")); return; }
    queue.push(segment);
    void drain();
  };
  try {
    unsubscribe = await ports.subscribe(identity, receive, stop);
    if (!running) unsubscribe();
    const fresh = await ports.access(identity);
    if (!isAuthorized(identity, fresh)) stop();
  } catch (error) { stop(); throw error; }
  return { stop };
}

/** Goal creation is available only through this explicit server-authorized approval operation. */
export async function approveMeetingProposal(identity: MeetingIdentity, proposalId: string, selection: GoalProposal["proposedGoal"] & { autonomy: "WATCH" | "PREPARE" | "ACT" }, ports: MeetingSessionPorts) {
  if (!identity.userId || !identity.meetingId || !proposalId || !selection.statement.trim() || selection.statement.length > 500 ||
      !["WATCH", "PREPARE", "ACT"].includes(selection.autonomy)) throw new Error("Invalid approval");
  await ports.approvePending(identity, proposalId, selection);
}

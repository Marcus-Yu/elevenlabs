import { describe, expect, it, vi } from "vitest";
import { meetingPersistence, type MeetingTransaction } from "./persistence";

const identity = { userId: "u1", meetingId: "meeting-1" };
const proposal = { transcriptExcerpt: "need a manufacturer", proposedGoal: { direction: "BUY" as const, kind: "manufacturer" as const, statement: "Find manufacturer" } };
function setup(consent: { revokedAt: Date | null } | null = { revokedAt: null }, active = true) {
  const findFirst = vi.fn(async () => consent);
  const create = vi.fn(async () => ({}));
  const tx = { consent: { findFirst }, needProposal: { create } };
  const transaction = vi.fn(async (fn: (tx: MeetingTransaction) => Promise<unknown>, _options: { isolationLevel: "Serializable" }) => fn(tx));
  const db = { $transaction: transaction } as unknown as Parameters<typeof meetingPersistence>[0];
  return { adapter: meetingPersistence(db, async () => active), findFirst, create, transaction };
}
describe("meeting persistence", () => {
  it("stores only pending proposal data after serializable consent and active checks", async () => {
    const { adapter, findFirst, create, transaction } = setup();
    expect(await adapter.saveIfAuthorized(identity, proposal)).toBe(true);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", kind: "meeting_listening", scope: "meeting-1" } }));
    expect(transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
    expect(create).toHaveBeenCalledWith({ data: { userId: "u1", ...proposal, status: "PENDING" } });
  });
  it("does not store absent or revoked consent or inactive meetings", async () => {
    for (const item of [setup(null), setup({ revokedAt: new Date() }), setup({ revokedAt: null }, false)]) {
      expect(await item.adapter.access(identity)).toBeNull();
      expect(await item.adapter.saveIfAuthorized(identity, proposal)).toBe(false);
      expect(item.create).not.toHaveBeenCalled();
    }
  });
  it("rejects oversized input and propagates transaction errors", async () => {
    const item = setup();
    expect(await item.adapter.saveIfAuthorized(identity, { ...proposal, transcriptExcerpt: "x".repeat(501) })).toBe(false);
    item.transaction.mockRejectedValueOnce(new Error("serialization conflict"));
    await expect(item.adapter.saveIfAuthorized(identity, proposal)).rejects.toThrow("serialization conflict");
    expect(item.create).not.toHaveBeenCalled();
  });
});

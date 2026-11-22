import { beforeEach, describe, expect, it, vi } from "vitest";
const gateway = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../server/gateway", () => ({ gateway }));
vi.mock("wasp/server", () => ({ HttpError: class extends Error { constructor(public statusCode: number, message: string) { super(message); } } }));
import { confirmThreadMemory } from "./memory-operations";
const allow = (data: unknown) => ({ decision: { outcome: "allow", ruleId: "default" }, logId: "l", data });
const ctx = { user: { id: "signed-in" } } as Parameters<typeof confirmThreadMemory>[1];
const memory = { id: "m", kind: "fact" as const, text: "Remote work", source: "user" };
beforeEach(() => gateway.execute.mockReset());
describe("confirm thread memory", () => {
  it("uses the authenticated user as actor for the exact saved proposal", async () => {
    gateway.execute.mockResolvedValue(allow({ id: "m" }));
    await expect(confirmThreadMemory({ action: "remember", memory: { kind: "preference", text: "Remote work" } }, ctx)).resolves.toEqual({ kind: "allowed" });
    expect(gateway.execute).toHaveBeenCalledWith(expect.objectContaining({ actionType: "memory.write", userId: "signed-in", actor: { kind: "user", id: "signed-in" }, tainted: false, payload: { kind: "preference", text: "Remote work", source: "User request in thread" } }));
  });
  it("rechecks the owned preview before deleting and refuses stale data", async () => {
    gateway.execute.mockResolvedValueOnce(allow([{ ...memory, userId: "signed-in", externalRef: null }])).mockResolvedValueOnce(allow({ deleted: true }));
    await expect(confirmThreadMemory({ action: "forget", memory }, ctx)).resolves.toEqual({ kind: "allowed", deleted: true });
    expect(gateway.execute).toHaveBeenLastCalledWith(expect.objectContaining({ actionType: "memory.delete", userId: "signed-in", payload: { id: "m" } }));
    gateway.execute.mockReset(); gateway.execute.mockResolvedValue(allow([{ ...memory, text: "Changed" }]));
    await expect(confirmThreadMemory({ action: "forget", memory }, ctx)).rejects.toThrow("Memory changed");
    expect(gateway.execute).toHaveBeenCalledTimes(1);
  });
  it("rejects unauthenticated calls and user-supplied identities", async () => {
    await expect(confirmThreadMemory({ action: "remember", memory: { kind: "fact", text: "Remote" } }, {} as never)).rejects.toThrow("Sign in");
    await expect(confirmThreadMemory({ action: "remember", memory: { kind: "fact", text: "Remote" }, userId: "other" } as never, ctx)).rejects.toThrow("Invalid");
    expect(gateway.execute).not.toHaveBeenCalled();
  });
});

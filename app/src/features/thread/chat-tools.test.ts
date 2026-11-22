import { describe, expect, it, vi } from "vitest";
import { createChatTools } from "./chat-tools";

const allow = (data: unknown) => ({ decision: { outcome: "allow", ruleId: "default" }, logId: "l", data });
const run = (tools: ReturnType<typeof createChatTools>, name: string, input: unknown) =>
  tools[name].execute!(input as never, {} as never);

describe("thread memory tools", () => {
  it("scopes reads to the signed-in user and strips private storage fields", async () => {
    const execute = vi.fn().mockResolvedValue(allow([{ id: "m", kind: "fact", text: "remote", source: "user", userId: "u", externalRef: "secret" }]));
    const tools = createChatTools({ userId: "u", execute });
    expect(await run(tools, "recall_memory", { text: "remote" })).toEqual({ kind: "allowed", stub: false, data: [{ id: "m", kind: "fact", text: "remote", source: "user" }] });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ userId: "u", actionType: "memory.read", actor: { kind: "agent", id: "thread" }, payload: { text: "remote", limit: 20 } }));
  });
  it("only proposes writes and reads a deletion preview from owned memory", async () => {
    const execute = vi.fn().mockResolvedValueOnce(allow({ kind: "preference", text: "Remote work" }))
      .mockResolvedValueOnce(allow({ stub: true, stored: false })).mockResolvedValueOnce(allow([{ id: "m", kind: "fact", text: "Remote work", source: "user", userId: "u" }]));
    const tools = createChatTools({ userId: "u", execute });
    expect(await run(tools, "remember", { kind: "preference", text: "Remote work" })).toMatchObject({ kind: "memory_proposal", action: "remember" });
    expect(await run(tools, "remember", { kind: "fact", text: "Remote work" })).toMatchObject({ kind: "unavailable" });
    expect(await run(tools, "forget", { id: "m" })).toMatchObject({ kind: "memory_proposal", action: "forget", memory: { id: "m", text: "Remote work" } });
    expect(execute.mock.calls.map(([request]) => request.actionType)).toEqual(["thread.propose_memory", "thread.propose_memory", "memory.read"]);
  });
});

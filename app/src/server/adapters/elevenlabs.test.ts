import { describe, expect, it, vi } from "vitest";
import { createConversationToken, createScribeToken } from "./elevenlabs";
import type { HttpClient } from "./http";

function fake(mode: HttpClient["mode"], body: unknown, ok = true) {
  const request = vi.fn().mockResolvedValue({ mode, status: ok ? 200 : 403, ok, body });
  return { mode, request } as HttpClient & { request: typeof request };
}
describe("ElevenLabs token adapter", () => {
  it("requests a conversation token and returns its binding ID", async () => {
    const client = fake("live", { token: "synthetic-token", conversation_id: "conversation-1" });
    expect(await createConversationToken({ client, apiKey: "synthetic-key", agentId: "agent 1" }))
      .toEqual({ token: "synthetic-token", conversationId: "conversation-1" });
    expect(client.request).toHaveBeenCalledWith({ provider: "elevenlabs", method: "GET",
      url: "https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent+1",
      headers: { "xi-api-key": "synthetic-key" } });
  });
  it("requests a single-use Scribe token", async () => {
    const client = fake("live", { token: "synthetic-token" });
    expect(await createScribeToken({ client, apiKey: "synthetic-key" })).toEqual({ token: "synthetic-token" });
    expect(client.request).toHaveBeenCalledWith({ provider: "elevenlabs", method: "POST",
      url: "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", headers: { "xi-api-key": "synthetic-key" } });
  });
  it.each(["record", "replay"] as const)("rejects %s before requesting a credential", async (mode) => {
    const client = fake(mode, { token: "synthetic-token" });
    await expect(createScribeToken({ client, apiKey: "synthetic-key" })).rejects.toThrow(/disabled/);
    expect(client.request).not.toHaveBeenCalled();
  });
  it("fails closed without echoing response bodies", async () => {
    const client = fake("live", { detail: "sensitive provider response" }, false);
    await expect(createConversationToken({ client, apiKey: "synthetic-key", agentId: "a" })).rejects.toThrow("(403)");
    const malformed = fake("live", { token: "synthetic-token" });
    await expect(createConversationToken({ client: malformed, apiKey: "synthetic-key", agentId: "a" }))
      .rejects.toThrow("Invalid ElevenLabs conversation token response");
  });
});

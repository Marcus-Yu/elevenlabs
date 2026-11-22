import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { processPostCallWebhook, type PostCallStore } from "./post-call-webhook";
import type { UntrustedText } from "../../shared/contracts/discovery";
const secret = "synthetic-secret", nowSeconds = 1753876800;
const source = { provider: "web" as const, url: "https://example.test", fetchedAt: "2026-01-01", claim: "synthetic test" };
const wrapTranscript = (text: string): UntrustedText => ({ kind: "untrusted", text, source, flagged: false });
function request(body: unknown, store: PostCallStore) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const digest = createHmac("sha256", secret).update(`${nowSeconds}.`).update(rawBody).digest("hex");
  return { rawBody, secret, nowSeconds, signatureHeader: `t=${nowSeconds},v0=${digest}`, store, wrapTranscript };
}
const event = { type: "post_call_transcription", event_timestamp: nowSeconds, data: {
  agent_id: "agent-1", conversation_id: "conversation-1", transcript: [
    { role: "agent", message: "What about the price?" }, { role: "user", message: "Here is the price." },
    { role: "agent", message: null },
  ],
} };
describe("processPostCallWebhook", () => {
  it("verifies before passing untrusted turns and exact identifiers to the store", async () => {
    const store = { storeIfAuthorized: vi.fn<PostCallStore["storeIfAuthorized"]>().mockResolvedValue("stored") };
    expect(await processPostCallWebhook(request(event, store))).toBe("stored");
    expect(store.storeIfAuthorized).toHaveBeenCalledWith({ conversationId: "conversation-1", agentId: "agent-1",
      eventTimestamp: nowSeconds, turns: [{ role: "agent", content: wrapTranscript("What about the price?") },
        { role: "user", content: wrapTranscript("Here is the price.") }] });
  });
  it("never stores unverified or malformed events", async () => {
    const store = { storeIfAuthorized: vi.fn<PostCallStore["storeIfAuthorized"]>() };
    expect(await processPostCallWebhook({ ...request(event, store), signatureHeader: "bad" })).toBe("invalid_signature");
    expect(await processPostCallWebhook(request({ ...event, type: "post_call_audio" }, store))).toBe("invalid_payload");
    expect(store.storeIfAuthorized).not.toHaveBeenCalled();
  });
  it("returns the store's atomic authorization and retry result", async () => {
    const store = { storeIfAuthorized: vi.fn<PostCallStore["storeIfAuthorized"]>()
      .mockResolvedValueOnce("unknown_conversation").mockResolvedValueOnce("duplicate") };
    expect(await processPostCallWebhook(request(event, store))).toBe("unknown_conversation");
    expect(await processPostCallWebhook(request(event, store))).toBe("duplicate");
  });
});

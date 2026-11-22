import { describe, expect, it, vi } from "vitest";
import { createVoiceHandlers } from "./voice";
import { summarizePayload, writeLog } from "../pipeline";

describe("voice gateway handlers", () => {
  it("uses the documented token and TTS endpoints without exposing provider errors", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: "test-token" }))).mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    const handlers = createVoiceHandlers("key", fetcher as typeof fetch);
    expect((await handlers["voice.scribe_token"]!.run({}, {} as never)).data).toEqual({ token: "test-token" });
    expect((await handlers["voice.speak"]!.run({ text: "hello" }, {} as never)).data).toEqual({ audio: "AQID" });
    expect(String(fetcher.mock.calls[0][0])).toContain("single-use-token/realtime_scribe");
    expect(String(fetcher.mock.calls[1][0])).toContain("text-to-speech/");
    const failing = createVoiceHandlers("key", vi.fn().mockRejectedValue(new Error("sensitive")) as typeof fetch);
    await expect(failing["voice.speak"]!.run({ text: "hello" }, {} as never)).rejects.toThrow("Voice service request failed");
  });
  it("does not log voice payloads", async () => {
    const write = vi.fn(async (_entry: unknown) => ({ id: "log" }));
    await writeLog({ store: { writeLog: write }, env: { adapterMode: "replay" } } as never,
      { userId: "u", goalId: null, actor: { kind: "user", id: "u" }, origin: "voice", actionType: "voice.speak", payload: { text: "private" } }, "ALLOW", "default", null);
    expect(write.mock.calls[0][0]).toMatchObject({ inputSummary: null });
    expect(summarizePayload({ text: "private" })).toContain("private");
  });
});

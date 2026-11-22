import { describe, expect, it } from "vitest";
import { chatProviderConfig } from "./chatProvider";

describe("chat provider configuration", () => {
  it("defaults to Anthropic and requires a credential", () => {
    expect(() => chatProviderConfig({})).toThrow("not configured");
    expect(chatProviderConfig({ ANTHROPIC_API_KEY: " key " })).toMatchObject({ apiKey: "key", model: "claude-opus-5-5" });
  });
  it("allows an explicitly configured loopback server without forwarding Anthropic credentials", () => {
    expect(chatProviderConfig({ ATLAS_CHAT_PROVIDER: "local", ATLAS_CHAT_LOCAL_BASE_URL: "http://127.0.0.1:58210/v1", ATLAS_CHAT_LOCAL_MODEL: "local", ANTHROPIC_API_KEY: "secret" })).toEqual({ apiKey: "local-only", baseURL: "http://127.0.0.1:58210/v1", model: "local" });
  });
  it.each(["http://example.com/v1", "https://127.0.0.1/v1", "http://127.0.0.1.evil/v1", "http://user@127.0.0.1/v1", "http://127.0.0.1/v1?x=1", "http://127.0.0.1/other"])("rejects unsafe URL %s", (url) => {
    expect(() => chatProviderConfig({ ATLAS_CHAT_PROVIDER: "local", ATLAS_CHAT_LOCAL_BASE_URL: url, ATLAS_CHAT_LOCAL_MODEL: "local" })).toThrow();
  });
  it("rejects unknown providers and missing models", () => {
    expect(() => chatProviderConfig({ ATLAS_CHAT_PROVIDER: "other" })).toThrow();
    expect(() => chatProviderConfig({ ATLAS_CHAT_PROVIDER: "local", ATLAS_CHAT_LOCAL_BASE_URL: "http://127.0.0.1/v1" })).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { alterConfigFrom, encodeGmailRaw } from "./alter";

describe("alter adapter", () => {
  it("encodes a Gmail raw message as base64url RFC 2822", () => {
    const raw = encodeGmailRaw({ to: "inbox@example.test", subject: "Intro: Ada ↔ Bo", body: "Hi both" });
    expect(raw).not.toMatch(/[+/=]/);
    const text = Buffer.from(raw, "base64url").toString("utf8");
    expect(text).toContain("To: inbox@example.test\r\n");
    expect(text).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(text.endsWith("\r\n\r\nHi both")).toBe(true);
  });

  it("reads config from env with blanks as null", () => {
    const config = alterConfigFrom({ ALTER_API_KEY: " ", ALTER_AGENT_KEY_ACT: "k" } as NodeJS.ProcessEnv);
    expect(config.appKey).toBeNull();
    expect(config.agentKeys["atlas-act"]).toBe("k");
    expect(config.agentKeys["atlas-prepare"]).toBeNull();
  });
});

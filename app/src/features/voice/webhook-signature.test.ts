import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyElevenLabsSignature } from "./webhook-signature";

const secret = "test-only-secret";
const nowSeconds = 1_753_876_800;
const body = Buffer.from('{"type":"post_call_transcription", "text":"café"}', "utf8");
function header(rawBody: Uint8Array = body, timestamp = nowSeconds) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
  return `t=${timestamp},v0=${digest}`;
}
function verify(signatureHeader: string | null, rawBody: Uint8Array = body, now = nowSeconds) {
  return verifyElevenLabsSignature({ rawBody, signatureHeader, secret, nowSeconds: now });
}

describe("verifyElevenLabsSignature", () => {
  it("accepts an authentic signature over the exact raw bytes", () => {
    expect(verify(header())).toBe(true);
    expect(verify(`other=x, ${header()}`)).toBe(true);
    expect(verify(header(), Buffer.from('{"type":"post_call_transcription","text":"café"}'))).toBe(false);
  });
  it("bounds past and future timestamps to thirty minutes", () => {
    expect(verify(header(body, nowSeconds - 1800))).toBe(true);
    expect(verify(header(body, nowSeconds + 1800))).toBe(true);
    expect(verify(header(body, nowSeconds - 1801))).toBe(false);
    expect(verify(header(body, nowSeconds + 1801))).toBe(false);
  });
  it("rejects missing, malformed, ambiguous, or incorrect signatures", () => {
    expect(verify(null)).toBe(false);
    expect(verify("t=abc,v0=00")).toBe(false);
    expect(verify(`t=${nowSeconds},${header()}`)).toBe(false);
    expect(verify(`${header()},v0=${"0".repeat(64)}`)).toBe(false);
    expect(verify(`t=${nowSeconds},v0=${"0".repeat(64)}`)).toBe(false);
    expect(verifyElevenLabsSignature({ rawBody: body, signatureHeader: header(), secret: "", nowSeconds })).toBe(false);
    expect(verify(header(), body, Number.NaN)).toBe(false);
  });
});

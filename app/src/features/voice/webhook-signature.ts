import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 30 * 60;

/** Verify the ElevenLabs-Signature header against the exact request bytes before parsing.
 * The caller supplies current Unix time in seconds; no clock, network, or secret lookup occurs here.
 * Both past and future timestamps are limited to 30 minutes of clock skew.
 */
export function verifyElevenLabsSignature({
  rawBody, signatureHeader, secret, nowSeconds,
}: {
  rawBody: Uint8Array;
  signatureHeader: string | null | undefined;
  secret: string;
  nowSeconds: number;
}): boolean {
  if (!signatureHeader || !secret || !Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return false;

  let timestamp: string | undefined;
  let digest: string | undefined;
  for (const part of signatureHeader.split(",")) {
    const [key, ...rest] = part.trim().split("=");
    const value = rest.join("=");
    if (key === "t") {
      if (timestamp !== undefined) return false;
      timestamp = value;
    } else if (key === "v0") {
      if (digest !== undefined) return false;
      digest = value;
    }
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || !digest || !/^[0-9a-f]{64}$/.test(digest)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(nowSeconds - seconds) > MAX_AGE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(timestamp + ".", "utf8").update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(digest, "hex"));
}

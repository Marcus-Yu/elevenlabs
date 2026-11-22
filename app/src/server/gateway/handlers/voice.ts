import { z } from "zod";
import type { HandlerMap } from "../types";

/** Provider errors are deliberately generic: never log response bodies or credentials. */
export function createVoiceHandlers(key: string | undefined, fetcher: typeof fetch = fetch): HandlerMap {
  const post = async (url: string, body?: unknown) => {
    if (!key) throw new Error("Voice service is not configured");
    let response: Response;
    try { response = await fetcher(url, { method: "POST", headers: { "xi-api-key": key, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error("Voice service request failed"); }
    if (!response.ok) throw new Error("Voice service request failed");
    return response;
  };
  return {
    "voice.scribe_token": { payload: z.object({}).strict(), async run() {
      const response = await post("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe?max_session_duration_seconds=300");
      let json: unknown;
      try { json = await response.json(); } catch { throw new Error("Voice service returned an invalid token"); }
      const parsed = z.object({ token: z.string().min(1).max(4096) }).safeParse(json);
      if (!parsed.success) throw new Error("Voice service returned an invalid token");
      return { data: { token: parsed.data.token } };
    } },
    "voice.speak": { payload: z.object({ text: z.string().trim().min(1).max(3000) }).strict(), async run({ text }) {
      const response = await post("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/stream?output_format=mp3_44100_128", { text, model_id: "eleven_multilingual_v2" });
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength > 10_000_000) throw new Error("Voice service returned invalid audio");
      return { data: { audio: Buffer.from(buffer).toString("base64") } };
    } },
  };
}

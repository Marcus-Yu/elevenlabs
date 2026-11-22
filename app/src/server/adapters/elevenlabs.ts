import { z } from "zod";
import { createHttpClient, type HttpClient } from "./http";

// Token responses are bearer credentials. The generic recorder cannot safely
// record them; only live mode is allowed, and replay tokens cannot authorize a call.
function tokenClient(client?: HttpClient): HttpClient {
  const http = client ?? createHttpClient();
  if (http.mode !== "live") throw new Error("ElevenLabs token issuance requires live mode; token recording and replay are disabled");
  return http;
}
const tokenSchema = z.object({ token: z.string().min(1) });
const conversationSchema = tokenSchema.extend({ conversation_id: z.string().min(1) });

/** Only gateway handlers may call provider adapters; API keys stay server-side. */
export async function createConversationToken(input: { apiKey: string; agentId: string; client?: HttpClient }) {
  if (!input.apiKey || !input.agentId) throw new Error("ElevenLabs API key and agent ID are required");
  const client = tokenClient(input.client);
  const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/token");
  url.searchParams.set("agent_id", input.agentId);
  const response = await client.request({ provider: "elevenlabs", method: "GET", url: url.toString(),
    headers: { "xi-api-key": input.apiKey } });
  if (!response.ok) throw new Error(`ElevenLabs conversation token request failed (${response.status})`);
  const parsed = conversationSchema.safeParse(response.body);
  if (!parsed.success) throw new Error("Invalid ElevenLabs conversation token response");
  return { token: parsed.data.token, conversationId: parsed.data.conversation_id };
}

/** Generate a single-use realtime Scribe token; see ElevenLabs tokens/create. */
export async function createScribeToken(input: { apiKey: string; client?: HttpClient }) {
  if (!input.apiKey) throw new Error("ElevenLabs API key is required");
  const client = tokenClient(input.client);
  const response = await client.request({ provider: "elevenlabs", method: "POST",
    url: "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", headers: { "xi-api-key": input.apiKey } });
  if (!response.ok) throw new Error(`ElevenLabs Scribe token request failed (${response.status})`);
  const parsed = tokenSchema.safeParse(response.body);
  if (!parsed.success) throw new Error("Invalid ElevenLabs Scribe token response");
  return { token: parsed.data.token };
}

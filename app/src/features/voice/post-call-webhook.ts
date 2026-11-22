import { z } from "zod";
import type { UntrustedText } from "../../shared/contracts/discovery";
import { verifyElevenLabsSignature } from "./webhook-signature";

const eventSchema = z.object({
  type: z.literal("post_call_transcription"), event_timestamp: z.number().int().nonnegative(),
  data: z.object({ conversation_id: z.string().min(1), agent_id: z.string().min(1),
    transcript: z.array(z.object({ role: z.enum(["user", "agent"]), message: z.string().nullable() })) }),
});
export type PostCallResult = "stored" | "duplicate" | "unknown_conversation" | "invalid_signature" | "invalid_payload";

/** Atomically check an existing authorized conversation/agent mapping, store separately
 * from the pitch, and deduplicate delivery. Never create mappings from webhook data. */
export interface PostCallStore {
  storeIfAuthorized(input: { conversationId: string; agentId: string; eventTimestamp: number;
    turns: { role: "user" | "agent"; content: UntrustedText }[];
  }): Promise<"stored" | "duplicate" | "unknown_conversation">;
}

/** Verify exact bytes before parsing; delegate atomic authorization and storage. */
export async function processPostCallWebhook(input: {
  rawBody: Uint8Array; signatureHeader: string | null | undefined; secret: string; nowSeconds: number;
  store: PostCallStore; wrapTranscript: (text: string) => UntrustedText;
}): Promise<PostCallResult> {
  if (!verifyElevenLabsSignature(input)) return "invalid_signature";
  let body: unknown;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.rawBody)); }
  catch { return "invalid_payload"; }
  const event = eventSchema.safeParse(body);
  if (!event.success) return "invalid_payload";
  const { data, event_timestamp } = event.data;
  const turns = data.transcript.flatMap((turn) => turn.message === null ? [] : [{
    role: turn.role, content: input.wrapTranscript(turn.message),
  }]);
  return input.store.storeIfAuthorized({ conversationId: data.conversation_id, agentId: data.agent_id,
    eventTimestamp: event_timestamp, turns });
}

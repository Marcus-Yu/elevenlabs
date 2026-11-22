import type { ModelMessage } from "ai";
import { z } from "zod";
import type { MiddlewareConfigFn } from "wasp/server";
import type { ChatApi } from "wasp/server/api";
import { gateway } from "../../server/gateway";
import type { Gateway } from "../../server/gateway/engine";
import { chatProviderConfig } from "../../server/gateway/handlers/chatProvider";

export const chatMiddleware: MiddlewareConfigFn = (config) => config;

const partsSchema = z.object({ type: z.string(), text: z.string().max(12_000).optional() }).passthrough();
const inputSchema = z.object({ messages: z.array(z.object({
  role: z.enum(["user", "assistant"]), parts: z.array(partsSchema).max(100),
}).passthrough()).min(1).max(40) });

/** Only plain text history is trusted as conversation input; client-supplied tool results
 * never become authoritative tool results or system instructions. */
export function parseChatMessages(input: unknown): ModelMessage[] | null {
  let size: number;
  try { size = Buffer.byteLength(JSON.stringify(input)); } catch { return null; }
  if (size > 100_000) return null;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") return null;
  const messages = parsed.data.messages.map(({ role, parts }) => ({
    role, content: parts.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n"),
  }));
  if (!messages.at(-1)?.content.trim() || messages.some(({ content }) => content.length > 12_000)) return null;
  return messages.filter(({ content }) => content.trim().length > 0);
}

interface ChatRuntime {
  providerReady: boolean;
  execute: Gateway["execute"];
}

type ChatStream = { pipeUIMessageStreamToResponse: (response: Parameters<ChatApi>[1], options: { onError: () => string }) => void };

export function makeChatApi(runtime: ChatRuntime): ChatApi {
  return async (req, res, context) => {
    res.set("Cache-Control", "no-store");
    if (!context.user?.id) { res.status(401).json({ error: "unauthorized" }); return; }
    const messages = parseChatMessages(req.body);
    if (!messages) { res.status(400).json({ error: "invalid_messages" }); return; }
    if (!runtime.providerReady) {
      res.status(503).json({ error: "chat_unavailable" }); return;
    }
    try {
      const result = await runtime.execute({ actionType: "thread.chat", userId: context.user.id,
        actor: { kind: "user", id: context.user.id }, origin: "thread", tainted: false,
        payload: { messages } });
      if (result.decision.outcome !== "allow") {
        res.status(403).json({ error: "chat_denied", ruleId: result.decision.ruleId }); return;
      }
      const stream = result.data as ChatStream;
      if (!stream || typeof stream.pipeUIMessageStreamToResponse !== "function") throw new Error("Invalid stream");
      stream.pipeUIMessageStreamToResponse(res, { onError: () => "Chat response failed." });
    } catch {
      if (!res.headersSent) res.status(502).json({ error: "chat_failed" });
      else res.end();
    }
  };
}

export function isChatProviderReady(env: NodeJS.ProcessEnv): boolean {
  try { chatProviderConfig(env); return true; } catch { return false; }
}

export const chatApi: ChatApi = (req, res, context) => makeChatApi({
  providerReady: isChatProviderReady(process.env),
  execute: gateway.execute,
})(req, res, context);

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { resolveFastModel } from "../../llm/models";

/** Local inference is opt-in and restricted to a literal loopback address. */
export function chatProviderConfig(env: NodeJS.ProcessEnv) {
  if (env.ATLAS_CHAT_PROVIDER === "local") {
    const model = env.ATLAS_CHAT_LOCAL_MODEL?.trim();
    let url: URL;
    try { url = new URL(env.ATLAS_CHAT_LOCAL_BASE_URL ?? ""); }
    catch { throw new Error("Local chat provider URL is not configured"); }
    if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/$/, "") !== "/v1" || !model) {
      throw new Error("Local chat provider requires a loopback HTTP /v1 URL and model");
    }
    return { apiKey: "local-only", baseURL: url.toString().replace(/\/$/, ""), model };
  }
  if (env.ATLAS_CHAT_PROVIDER && env.ATLAS_CHAT_PROVIDER !== "anthropic") throw new Error("Unknown chat provider");
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Chat provider is not configured");
  return { apiKey, model: resolveFastModel(env) };
}

export function createChatModel(env: NodeJS.ProcessEnv): LanguageModel {
  const { model, ...settings } = chatProviderConfig(env);
  return createAnthropic(settings)(model);
}

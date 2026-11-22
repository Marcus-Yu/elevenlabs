import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | undefined;

/**
 * Shared server-side Anthropic client (reads ANTHROPIC_API_KEY).
 * Created on first use, so importing this module never needs a key and TraceRoot (WP7)
 * can instrument the SDK module before the first call.
 */
export function getAnthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

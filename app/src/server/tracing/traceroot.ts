import * as anthropicSDK from "@anthropic-ai/sdk";
import { getCurrentTraceId, observe, TraceRoot, updateCurrentSpan } from "@traceroot-ai/traceroot";

// TraceRoot telemetry (WP7). This is the one outside-world call that lives outside
// src/server/adapters/: spans are exported by the TraceRoot SDK's own exporter, carry ids and
// decisions only, and never trigger an action. See the PR for the rule 2 exception.
//
// Tracing is optional: with no TRACEROOT_API_KEY every helper just runs its function.

export type TraceValue = string | number | boolean | string[];
export type TraceAttributes = Record<string, TraceValue | null | undefined>;

let started = false;

/** Starts TraceRoot once per process when a key is configured. Needs no Anthropic key. */
export function initTracing(env: NodeJS.ProcessEnv = process.env): boolean {
  if (started) return true;
  if (!env.TRACEROOT_API_KEY || env.TRACEROOT_ENABLED === "false") return false;
  TraceRoot.initialize({
    instrumentModules: { anthropic: anthropicSDK },
    environment: env.TRACEROOT_ENVIRONMENT ?? "development",
  });
  started = true;
  const flush = () => void TraceRoot.shutdown().catch(() => undefined);
  process.once("SIGTERM", flush);
  process.once("SIGINT", flush);
  process.once("beforeExit", flush);
  return true;
}

export function tracingActive(): boolean {
  return started && TraceRoot.isTracingActive();
}

/** The current trace id inside traceRun/observe, or null when tracing is off. */
export function currentTraceId(): string | null {
  return tracingActive() ? (getCurrentTraceId() ?? null) : null;
}

/** Flattens attributes to the primitive values span attributes accept; drops empty values. */
export function toSpanAttributes(attributes: TraceAttributes): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return out;
}

/** Adds attributes to the active span. No-op outside a span or with tracing off. */
export function annotateSpan(attributes: TraceAttributes): void {
  if (tracingActive()) updateCurrentSpan({ attributes: toSpanAttributes(attributes) });
}

export interface TraceRunOptions {
  type?: "span" | "agent" | "tool" | "llm";
}

/**
 * Runs `fn` inside one TraceRoot span named `name`. Nested traceRun calls and gateway.execute
 * calls made inside `fn` join the same trace, so one WP5 pipeline run is one trace:
 *   criteria → company.search → evidence → ranking → explanation.
 * Attributes must be ids (fact ids, goal id, match ids), counts and scores — never fact values.
 * Inputs and outputs are not captured, so private values in `fn`'s arguments never leave.
 */
export async function traceRun<T>(name: string, attributes: TraceAttributes, fn: () => Promise<T>, options: TraceRunOptions = {}): Promise<T> {
  if (!tracingActive()) return fn();
  return observe({ name, type: options.type ?? "agent", captureInput: false, captureOutput: false }, async () => {
    annotateSpan(attributes);
    return fn();
  });
}

import type { GatewayStore } from "../gateway/store";
import { currentTraceId } from "../tracing/traceroot";
import { LOCAL_BACKEND_STAMP, type ExecutionBackend } from "./backend";

/**
 * Decorates the gateway store's writeLog (WP7) so every ActionLog row gets the active TraceRoot
 * trace id and, on the local backend, the execution_backend=local stamp. The engine is untouched.
 */
export function withLogStamp(store: GatewayStore, backend: ExecutionBackend, traceId: () => string | null = currentTraceId): GatewayStore {
  const writeLog: GatewayStore["writeLog"] = (entry) =>
    store.writeLog({
      ...entry,
      traceId: entry.traceId ?? traceId(),
      reason: backend === "local" ? [LOCAL_BACKEND_STAMP, entry.reason].filter(Boolean).join("; ") : entry.reason,
    });
  // A Proxy rather than a spread: stores may be class instances whose methods live on the prototype.
  return new Proxy(store, {
    get(target, prop) {
      if (prop === "writeLog") return writeLog;
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

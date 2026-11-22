import type { HandlerMap } from "../types";
import { createStubHandlers } from "./stubs";

/**
 * The handler registration list. Owners register real handlers by adding their map after the
 * stubs; a later entry replaces the stub for that action type. Only this folder may import
 * src/server/adapters/ (AGENTS.md rule 2).
 *
 *   return { ...createStubHandlers(), ...createDiscoveryHandlersFromEnv(env) };
 */
export function createHandlerMap(_env: NodeJS.ProcessEnv = process.env): HandlerMap {
  return {
    ...createStubHandlers(),
  };
}

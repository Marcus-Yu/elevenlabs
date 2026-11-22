import type { PrismaClient } from "@prisma/client";
import type { HandlerMap } from "../types";
import { createOutreachHandlersFromEnv } from "./outreach.prisma";
import { createStubHandlers } from "./stubs";

/**
 * The handler registration list. Owners register real handlers by adding their map after the
 * stubs; a later entry replaces the stub for that action type. Only this folder may import
 * src/server/adapters/ (AGENTS.md rule 2).
 *
 *   return { ...createStubHandlers(), ...createDiscoveryHandlersFromEnv(env) };
 */
export function createHandlerMap(env: NodeJS.ProcessEnv = process.env, prisma?: PrismaClient): HandlerMap {
  return {
    ...createStubHandlers(),
    // WP7: real outreach.send (EXECUTION_BACKEND=local|alter). Needs Prisma for goal autonomy.
    ...(prisma ? createOutreachHandlersFromEnv(prisma, env) : {}),
  };
}

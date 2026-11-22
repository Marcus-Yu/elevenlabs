import type { MemoryItemDelegate } from "../../../features/memory/memoryStore";
import type { HandlerMap } from "../types";
import { createDiscoveryHandlersFromEnv } from "./discovery";
import { createMatchSubmission, type MatchSubmissionDatabase } from "./matchSubmission";
import { createMemoryHandlers, createMemoryStoreFromEnv } from "./memory";
import { createStubHandlers } from "./stubs";

export interface HandlerDeps {
  /** Prisma's MemoryItem delegate (prisma.memoryItem), for the WP12 memory handlers. */
  memoryItems: MemoryItemDelegate;
  matchDatabase: MatchSubmissionDatabase;
}

/**
 * The handler registration list. Later entries replace the stub for that action type. Only this
 * folder may import src/server/adapters/ (AGENTS.md rule 2).
 *
 * - Discovery (WP2): company.search, jobs.search, contact.search, contact.reveal_email, web.read.
 *   With ADAPTER_MODE=replay (the default) they read recorded fixtures and need no keys; a request
 *   without a fixture throws FixtureMissError, which the gateway logs as handler_error. Nothing is invented.
 * - Memory (WP12): memory.read, memory.write, memory.delete (Postgres, mirrored to Rowboat when configured).
 * - Watcher submissions (WP10): match.submit persists sourced matches for the goal.
 * - Everything else (draft.create, outreach.send, call.place, meeting.listen,
 *   card.publish, card.reveal) stays on the labelled stubs until its owner registers a real handler.
 */
export function createHandlerMap(env: NodeJS.ProcessEnv, deps: HandlerDeps): HandlerMap {
  return {
    ...createStubHandlers(),
    ...createDiscoveryHandlersFromEnv(env),
    ...createMemoryHandlers(createMemoryStoreFromEnv(deps.memoryItems, env)),
    "match.submit": createMatchSubmission(deps.matchDatabase),
  };
}

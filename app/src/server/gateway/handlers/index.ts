import type { PrismaClient } from "@prisma/client";
import type { MemoryItemDelegate } from "../../../features/memory/memoryStore";
import type { Gateway } from "../engine";
import type { HandlerMap } from "../types";
import { createCalibrationHandlers } from "./calibration";
import { createDiscoveryHandlersFromEnv } from "./discovery";
import { createMatchSubmission, type MatchSubmissionDatabase } from "./matchSubmission";
import { createMemoryHandlers, createMemoryStoreFromEnv } from "./memory";
import { createOutreachHandlersFromEnv } from "./outreach.prisma";
import { createStubHandlers } from "./stubs";
import { createGoalProposalHandler, createThreadChatHandler } from "./threadChat";
import { createVoiceHandlers } from "./voice";

export interface HandlerDeps {
  /** Prisma's MemoryItem delegate (prisma.memoryItem), for the WP12 memory handlers. */
  memoryItems: MemoryItemDelegate;
  matchDatabase: MatchSubmissionDatabase;
  executeThreadTool: Gateway["execute"];
  /** WP7: outreach.send reads the goal autonomy level. Omitted in unit tests. */
  prisma?: PrismaClient;
}

/**
 * The handler registration list. Later entries replace the stub for that action type. Only this
 * folder may import src/server/adapters/ (AGENTS.md rule 2).
 *
 * - Discovery (WP2): company.search, jobs.search, contact.search, contact.reveal_email, web.read.
 *   With ADAPTER_MODE=replay (the default) they read recorded fixtures and need no keys; a request
 *   without a fixture throws FixtureMissError, which the gateway logs as handler_error. Nothing is invented.
 * - Thread (WP4): thread.chat, thread.propose_goal, calibration.profiles, calibration.criteria.
 * - Voice (WP9): voice.scribe_token, voice.speak (ElevenLabs live only).
 * - Memory (WP12): memory.read, memory.write, memory.delete (Postgres, mirrored to Rowboat when configured).
 * - Watcher submissions (WP10): match.submit persists sourced matches for the goal.
 * - Outreach (WP7): outreach.send, EXECUTION_BACKEND=local (default, stamped) or alter.
 * - Everything else (draft.create, call.place, meeting.listen,
 *   card.publish, card.reveal) stays on the labelled stubs until its owner registers a real handler.
 */
export function createHandlerMap(env: NodeJS.ProcessEnv, deps: HandlerDeps): HandlerMap {
  return {
    ...createStubHandlers(),
    ...createVoiceHandlers(env.ELEVENLABS_MODE === "live" || env.ADAPTER_MODE === "live" ? env.ELEVENLABS_API_KEY?.trim() : undefined),
    ...createCalibrationHandlers(env),
    "thread.propose_goal": createGoalProposalHandler(),
    "thread.chat": createThreadChatHandler(env, deps.executeThreadTool),
    ...createDiscoveryHandlersFromEnv(env),
    ...createMemoryHandlers(createMemoryStoreFromEnv(deps.memoryItems, env)),
    "match.submit": createMatchSubmission(deps.matchDatabase),
    // WP7: real outreach.send (EXECUTION_BACKEND=local|alter). Needs Prisma for goal autonomy.
    ...(deps.prisma ? createOutreachHandlersFromEnv(deps.prisma, env) : {}),
  };
}

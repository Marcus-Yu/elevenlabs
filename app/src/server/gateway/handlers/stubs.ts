import { createHash } from "node:crypto";
import { z } from "zod";
import {
  CallPlacePayload,
  CardPublishPayload,
  CardRevealPayload,
  DraftCreatePayload,
  MatchSubmitPayload,
  MeetingListenPayload,
  MemoryDeletePayload,
  MemoryReadPayload,
  MemoryWritePayload,
  OutreachSendPayload,
} from "../payloads";
import { defineHandler, type HandlerMap } from "../types";
import { STUB_COMPANIES, STUB_CONTACTS, STUB_JOBS, STUB_PAGE, STUB_REVEALED_EMAIL } from "./stubFixtures";

// Stub handlers (WP1 step 5): every action type has one, so WP4 and WP6 can build against real
// gateway decisions, ActionLog rows and Approval rows before the real handlers land. Stubs never
// touch the network, never write domain rows and always return `stub: true`. Real handlers
// replace them in handlers/index.ts.

const STUB_REASON = "stub_handler: no provider called, nothing persisted";
/** Discovery payloads are owned by WP2; until its handlers are registered, stubs accept any object. */
const AnyObject = z.looseObject({});

function stubId(prefix: string, value: unknown): string {
  return `${prefix}_stub_${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12)}`;
}

function stub<T>(data: T) {
  return { data: { stub: true as const, ...data }, logReason: STUB_REASON };
}

export function createStubHandlers(): HandlerMap {
  return {
    "thread.propose_goal": defineHandler({ payload: AnyObject, run: async () => stub({ available: false }) }),
    "thread.propose_memory": defineHandler({ payload: AnyObject, run: async () => stub({ available: false }) }),
    "thread.list_hiring_goals": defineHandler({ payload: AnyObject, run: async () => stub({ available: false }) }),
    "thread.list_matches": defineHandler({ payload: AnyObject, run: async () => stub({ available: false }) }),
    "thread.explain_match": defineHandler({ payload: AnyObject, run: async () => stub({ available: false }) }),
    "thread.chat": defineHandler({ payload: AnyObject, run: async () => stub({ available: false }) }),
    "calibration.profiles": defineHandler({ payload: AnyObject, run: async () => stub({ available: false }) }),
    "calibration.criteria": defineHandler({ payload: AnyObject, run: async () => stub({ available: false }) }),
    "pitch.score": defineHandler({ payload: AnyObject, run: async () => stub({ available: false }) }),
    "company.search": defineHandler({ payload: AnyObject, run: async () => stub({ companies: STUB_COMPANIES }) }),
    "jobs.search": defineHandler({ payload: AnyObject, run: async () => stub({ jobs: STUB_JOBS }) }),
    "contact.search": defineHandler({ payload: AnyObject, run: async () => stub({ contacts: STUB_CONTACTS, provider: "fiber" as const }) }),
    "contact.reveal_email": defineHandler({ payload: AnyObject, run: async () => stub({ email: STUB_REVEALED_EMAIL, provider: "fiber" as const }) }),
    "web.read": defineHandler({ payload: AnyObject, run: async () => stub(STUB_PAGE) }),
    "match.submit": defineHandler({
      payload: MatchSubmitPayload,
      run: async (payload) => stub({ accepted: true, matchId: stubId("match", payload.company.domain), domain: payload.company.domain }),
    }),
    "draft.create": defineHandler({
      payload: DraftCreatePayload,
      run: async (payload) => stub({ draft: { id: stubId("draft", payload), version: 1, ...payload } }),
    }),
    "outreach.send": defineHandler({
      payload: OutreachSendPayload,
      run: async (payload, ctx) =>
        stub({
          delivered: false,
          to: payload.to,
          ...(ctx.recipientRewrite ? { originalRecipient: ctx.recipientRewrite.from } : {}),
          ...(ctx.approvalId ? { approvalId: ctx.approvalId } : {}),
        }),
    }),
    "voice.scribe_token": defineHandler({ payload: z.object({}).strict(), run: async () => stub({}) }),
    "voice.speak": defineHandler({ payload: z.object({ text: z.string().trim().min(1).max(3000) }).strict(), run: async () => stub({}) }),
    "call.place": defineHandler({ payload: CallPlacePayload, run: async () => stub({ placed: false }) }),
    "memory.read": defineHandler({ payload: MemoryReadPayload, run: async () => stub({ items: [] }) }),
    "memory.write": defineHandler({ payload: MemoryWritePayload, run: async (payload) => stub({ stored: false, id: stubId("memory", payload) }) }),
    "memory.delete": defineHandler({ payload: MemoryDeletePayload, run: async () => stub({ deleted: false }) }),
    "meeting.listen": defineHandler({ payload: MeetingListenPayload, run: async () => stub({ listening: false }) }),
    "card.publish": defineHandler({ payload: CardPublishPayload, run: async () => stub({ published: false }) }),
    "card.reveal": defineHandler({ payload: CardRevealPayload, run: async () => stub({ revealed: false }) }),
  };
}

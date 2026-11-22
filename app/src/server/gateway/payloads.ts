import { z } from "zod";
import { CompanyRecordSchema } from "../../shared/contracts";

// Gateway-owned payload contracts for the actions whose payload the §8 rules read. A handler
// registered for one of these action types must accept this shape (it may add fields): the
// engine validates every request against both the handler's schema and this one.

const id = z.string().min(1).max(200);

/** outreach.send carries the exact text that will leave, so the approval hash covers it. */
export const OutreachSendPayload = z.object({
  draftId: id,
  draftVersion: z.number().int().min(1).optional(),
  to: z.email().max(320),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20_000),
});
export type OutreachSendPayload = z.infer<typeof OutreachSendPayload>;

export const DraftCreatePayload = z.object({
  matchId: id,
  contactId: id.optional(),
  channel: z.literal("email").default("email"),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20_000),
  /** SourceRef ids that personalise the draft; they must belong to the match. */
  personalizationRefs: z.array(id).max(50).default([]),
  /** ProfileFact ids the model was given; checked by need_to_know. */
  usedFactIds: z.array(id).max(50).default([]),
});
export type DraftCreatePayload = z.infer<typeof DraftCreatePayload>;

export const CallPlacePayload = z.object({
  /** E.164 or any formatting of the user's verified number. */
  toNumber: z.string().min(5).max(32),
  reason: z.string().max(500).optional(),
});
export type CallPlacePayload = z.infer<typeof CallPlacePayload>;

/** A watcher or the pipeline proposes a company for the goal. Persisted by the matches owner (WP5). */
export const MatchSubmitPayload = z.object({
  company: CompanyRecordSchema,
  rationale: z.string().min(1).max(2_000),
  runId: id.optional(),
  score: z.number().min(0).max(1).optional(),
});
export type MatchSubmitPayload = z.infer<typeof MatchSubmitPayload>;

export const CardPublishPayload = z.object({
  cardId: id,
  /** The exact card text that becomes visible to the matcher. */
  fields: z.record(z.string(), z.string().max(2_000)),
});
export type CardPublishPayload = z.infer<typeof CardPublishPayload>;

export const CardRevealPayload = z.object({
  cardMatchId: id,
  /** Identity fields this side agrees to reveal. */
  fields: z.array(z.string().min(1)).min(1).max(20),
});
export type CardRevealPayload = z.infer<typeof CardRevealPayload>;

export const MeetingListenPayload = z.object({ scope: z.string().min(1).max(200) });

export const MemoryReadPayload = z.object({ query: z.string().max(500).optional(), limit: z.number().int().min(1).max(100).optional() });
export const MemoryWritePayload = z.object({
  kind: z.enum(["preference", "objection", "outcome", "fact"]),
  text: z.string().min(1).max(4_000),
  source: z.string().min(1).max(500),
});
export const MemoryDeletePayload = z.object({ id });

/** What the rules read from contact.reveal_email; the handler (WP2) owns the rest of the shape. */
export const RevealEmailCore = z.looseObject({ companyDomain: z.string().min(1), matchId: id.optional() });
/** What preference_confirm reads from memory.write; the handler (WP12) owns the rest of the shape. */
export const MemoryWriteCore = z.looseObject({ kind: z.enum(["preference", "objection", "outcome", "fact"]) });

/** Payload contracts the engine enforces in addition to the handler's own schema. */
export const CORE_PAYLOADS = {
  "outreach.send": OutreachSendPayload,
  "draft.create": DraftCreatePayload,
  "call.place": CallPlacePayload,
  "match.submit": MatchSubmitPayload,
  "card.publish": CardPublishPayload,
  "card.reveal": CardRevealPayload,
  "contact.reveal_email": RevealEmailCore,
  "memory.write": MemoryWriteCore,
} as const;

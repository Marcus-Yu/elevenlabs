import type { ActionType } from "../../../shared/contracts";
import type { ConsentKind } from "../store";

/** Read actions: no side effects outside Atlas beyond fetching data. */
export const READ_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  "company.search",
  "jobs.search",
  "contact.search",
  "web.read",
  "memory.read",
]);

/** What a tainted request may still do (§8 taint rule). */
export const TAINT_ALLOWED: ReadonlySet<ActionType> = new Set<ActionType>([...READ_ACTIONS, "match.submit", "draft.create"]);

/** Actions that only make sense for one goal; they are denied without a goalId. */
export const GOAL_REQUIRED: ReadonlySet<ActionType> = new Set<ActionType>([
  "contact.reveal_email",
  "match.submit",
  "draft.create",
  "outreach.send",
]);

/** Consent each action needs (§8 consent rule). draft.create needs model_processing only when it uses facts. */
export const ACTION_CONSENT: Partial<Record<ActionType, ConsentKind>> = {
  "meeting.listen": "meeting_listening",
  "call.place": "phone_calls",
  "card.publish": "matching",
  "card.reveal": "identity_reveal",
};

/** Goal kinds that seek private individuals rather than companies. */
export const INDIVIDUAL_GOAL_KINDS: ReadonlySet<string> = new Set(["intern"]);

export const DEFAULT_DAILY_CAP = 10;

import type { ActionType } from "../../../shared/contracts";
import type { ConsentKind } from "../store";

/** Read actions: no side effects outside Atlas beyond fetching data. */
export const READ_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  "company.search",
  "jobs.search",
  "contact.search",
  "web.read",
  "memory.read",
  "calibration.profiles",
  "thread.propose_goal",
  "thread.list_matches",
  "thread.explain_match",
  "thread.list_hiring_goals",
  "thread.propose_memory",
]);

/** What a tainted request may still do (§8 taint rule). */
export const TAINT_ALLOWED: ReadonlySet<ActionType> = new Set<ActionType>([...READ_ACTIONS, "match.submit", "draft.create"]);

/** Actions whose payload leaves for a provider (§8 provider_minimum). Watcher requests are checked too. */
export const PROVIDER_BOUND: ReadonlySet<ActionType> = new Set<ActionType>([
  "company.search",
  "jobs.search",
  "contact.search",
  "contact.reveal_email",
  "web.read",
  "voice.speak",
  "calibration.profiles",
  "thread.chat",
]);

/** Actions that only make sense for one goal; they are denied without a goalId. */
export const GOAL_REQUIRED: ReadonlySet<ActionType> = new Set<ActionType>([
  "thread.list_matches",
  "thread.explain_match",
  "contact.reveal_email",
  "match.submit",
  "draft.create",
  "outreach.send",
]);

/** Consent each action needs (§8 consent rule). draft.create needs model_processing only when it uses facts. */
export const ACTION_CONSENT: Partial<Record<ActionType, ConsentKind>> = {
  "thread.chat": "model_processing",
  "meeting.listen": "meeting_listening",
  "voice.scribe_token": "model_processing",
  "voice.speak": "model_processing",
  "call.place": "phone_calls",
  "card.publish": "matching",
  "card.reveal": "identity_reveal",
};

/** Goal kinds that seek private individuals rather than companies. */
export const INDIVIDUAL_GOAL_KINDS: ReadonlySet<string> = new Set(["intern"]);

export const DEFAULT_DAILY_CAP = 10;

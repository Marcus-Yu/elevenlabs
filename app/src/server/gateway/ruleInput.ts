import type { ActionRequest } from "../../shared/contracts";
import type { CardPublishPayload, DraftCreatePayload, OutreachSendPayload, RevealEmailCore } from "./payloads";
import { PROVIDER_BOUND } from "./rules/actionGroups";
import { stripCardFields } from "./rules/cardFields";
import { collectStrings } from "./rules/factMatch";
import type { RuleInput, GatewayEnv } from "./rules/types";
import type { GatewayStore } from "./store";

/** Start of the current UTC day; daily_cap counts sends since then. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Loads only the data the rules need for this action type. `request.payload` is already validated. */
export async function buildRuleInput(
  store: GatewayStore,
  request: ActionRequest,
  phase: RuleInput["phase"],
  env: GatewayEnv,
  now: Date,
): Promise<RuleInput> {
  const { actionType, userId, goalId } = request;
  const [goal, user, consents] = await Promise.all([
    goalId ? store.getGoal(goalId) : Promise.resolve(null),
    actionType === "call.place" ? store.getUser(userId) : Promise.resolve(null),
    store.activeConsents(userId),
  ]);

  const input: RuleInput = {
    request,
    phase,
    goal,
    user,
    consents: new Set(consents),
    facts: [],
    usedFactIds: [],
    outgoingText: [],
    providerText: PROVIDER_BOUND.has(actionType) || request.origin === "watcher" ? collectStrings(request.payload) : [],
    recipient: null,
    recipientOptedOut: false,
    draft: null,
    match: null,
    revealMatch: null,
    researchedPerson: false,
    strippedFields: [],
    sendsToday: 0,
    priorApprovedSend: false,
    env,
  };

  if (actionType === "draft.create") {
    const payload = request.payload as DraftCreatePayload;
    input.usedFactIds = payload.usedFactIds;
    input.outgoingText = [payload.subject, payload.body];
    input.match = await store.getMatch(payload.matchId);
  } else if (actionType === "outreach.send") {
    const payload = request.payload as OutreachSendPayload;
    const recipient = payload.to.trim().toLowerCase();
    input.outgoingText = [payload.subject, payload.body];
    input.recipient = recipient;
    [input.draft, input.recipientOptedOut, input.sendsToday, input.priorApprovedSend, input.researchedPerson] = await Promise.all([
      store.getDraft(payload.draftId),
      store.isOptedOut(recipient),
      goalId ? store.countAllowedSends(goalId, startOfUtcDay(now)) : Promise.resolve(0),
      store.hasApprovedSendTo(userId, recipient),
      store.isResearchedCandidate(userId, { email: recipient }),
    ]);
  } else if (actionType === "contact.reveal_email") {
    const { matchId, companyDomain, fullName, linkedinUrl } = request.payload as RevealEmailCore;
    const [match, researched] = await Promise.all([
      matchId ? store.getMatch(matchId) : goalId ? store.findMatchByDomain(goalId, companyDomain) : Promise.resolve(null),
      store.isResearchedCandidate(userId, { companyDomain, fullName, linkedinUrl }),
    ]);
    input.revealMatch = match && match.goalId === goalId ? match : null;
    input.researchedPerson = researched;
  } else if (actionType === "card.publish") {
    input.facts = await store.getUserFacts(userId);
    const { payload, stripped } = stripCardFields(request.payload as CardPublishPayload, input.facts);
    input.request = { ...request, payload };
    input.strippedFields = stripped;
    input.outgoingText = Object.values(payload.fields);
  }

  if (actionType !== "card.publish" && (input.outgoingText.length > 0 || input.usedFactIds.length > 0 || input.providerText.length > 0)) {
    input.facts = await store.getUserFacts(userId);
  }
  return input;
}

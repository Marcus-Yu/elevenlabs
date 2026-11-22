import type { CardPublishPayload } from "../payloads";
import type { FactSnapshot } from "../store";
import { factAppearsIn, prepareText } from "./factMatch";

// Share-card field stripping on card.publish (scope change, 2026-11-22). Not a deny rule: the
// gateway drops each field built from a fact that may not be used for matching, logs which ones,
// and publishes the rest. A card with every field stripped is denied (rules/allow.ts).

export const CARD_FIELDS_RULE_ID = "card_fields";

/** Purposes that allow a fact on a share card. "card.publish" is the action-type spelling the WP0 seed uses. */
export const MATCHING_PURPOSES: readonly string[] = ["matching", "card.publish"];

export interface StrippedField {
  field: string;
  /** The fact that caused the strip; null when the declared fact id is not one of the user's facts. */
  factKey: string | null;
  why: "declared_fact_not_allowed" | "unknown_fact" | "fact_value_in_text";
}

export function allowedForMatching(fact: FactSnapshot): boolean {
  return fact.sensitivity !== "private" && fact.allowedPurposes.some((purpose) => MATCHING_PURPOSES.includes(purpose));
}

/**
 * Drops a field when a fact it declares (payload.fieldFacts) is private or not allowed for
 * matching, or when its text contains the value of such a fact, even if undeclared.
 */
export function stripCardFields(payload: CardPublishPayload, facts: FactSnapshot[]): { payload: CardPublishPayload; stripped: StrippedField[] } {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const disallowed = facts.filter((fact) => !allowedForMatching(fact));
  const fields: Record<string, string> = {};
  const fieldFacts: Record<string, string[]> = {};
  const stripped: StrippedField[] = [];

  for (const [field, text] of Object.entries(payload.fields)) {
    const declared = payload.fieldFacts[field] ?? [];
    const reason = declaredProblem(declared, byId) ?? valueProblem(text, disallowed);
    if (reason) {
      stripped.push({ field, ...reason });
      continue;
    }
    fields[field] = text;
    if (declared.length > 0) fieldFacts[field] = declared;
  }
  return { payload: { ...payload, fields, fieldFacts }, stripped };
}

function declaredProblem(declared: string[], byId: Map<string, FactSnapshot>): Omit<StrippedField, "field"> | null {
  for (const factId of declared) {
    const fact = byId.get(factId);
    if (!fact) return { factKey: null, why: "unknown_fact" };
    if (!allowedForMatching(fact)) return { factKey: fact.key, why: "declared_fact_not_allowed" };
  }
  return null;
}

function valueProblem(text: string, disallowed: FactSnapshot[]): Omit<StrippedField, "field"> | null {
  const prepared = prepareText([text]);
  const fact = disallowed.find((candidate) => factAppearsIn(candidate, prepared));
  return fact ? { factKey: fact.key, why: "fact_value_in_text" } : null;
}

export function describeStripped(stripped: StrippedField[]): string {
  const parts = stripped.map((s) => `"${s.field}" (${s.factKey ? `fact "${s.factKey}"` : "unknown fact"}: ${s.why})`);
  return `${CARD_FIELDS_RULE_ID}: stripped ${parts.join(", ")} as not allowed for matching`;
}

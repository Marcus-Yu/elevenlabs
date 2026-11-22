import type { FactSnapshot } from "../store";
import { factAppearsIn, prepareText } from "./factMatch";
import type { Rule } from "./types";

/** Returns the private fact a text reveals, by normalised text or by numeric value, or null. */
export function findPrivateLeak(facts: FactSnapshot[], texts: string[]): FactSnapshot | null {
  const prepared = prepareText(texts);
  return facts.find((fact) => fact.sensitivity === "private" && factAppearsIn(fact, prepared)) ?? null;
}

/** §8 `private_leak`: outgoing text may not contain the value of a private fact in any format. */
export const privateLeak: Rule = {
  id: "private_leak",
  kind: "deny",
  check({ facts, outgoingText }) {
    if (outgoingText.length === 0) return null;
    const leaked = findPrivateLeak(facts, outgoingText);
    return leaked ? `outgoing text contains the private fact "${leaked.key}"` : null;
  },
};

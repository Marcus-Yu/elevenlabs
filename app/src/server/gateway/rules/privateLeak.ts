import type { FactSnapshot } from "../store";
import { extractAmounts, sameAmount } from "./amounts";
import type { Rule } from "./types";

/** Numbers below this are too common to treat as a leak ("3 units", "24/7"). */
const MIN_SIGNIFICANT_AMOUNT = 100;
/** Shorter private strings would match by accident. */
const MIN_TEXT_LENGTH = 4;

function compact(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Returns the private fact a text reveals, by normalised text or by numeric value, or null. */
export function findPrivateLeak(facts: FactSnapshot[], texts: string[]): FactSnapshot | null {
  const joined = texts.join("\n");
  const compactText = compact(joined);
  const textAmounts = extractAmounts(joined);
  for (const fact of facts) {
    if (fact.sensitivity !== "private") continue;
    const value = compact(fact.value);
    if (value.length >= MIN_TEXT_LENGTH && compactText.includes(value)) return fact;
    const secretAmounts = extractAmounts(fact.value).filter((amount) => Math.abs(amount) >= MIN_SIGNIFICANT_AMOUNT);
    if (secretAmounts.some((secret) => textAmounts.some((amount) => sameAmount(secret, amount)))) return fact;
  }
  return null;
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

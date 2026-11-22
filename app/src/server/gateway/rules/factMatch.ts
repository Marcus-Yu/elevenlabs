import type { FactSnapshot } from "../store";
import { extractAmounts, sameAmount } from "./amounts";

// Decides whether a profile fact's value appears in some text: by normalised text, or for
// amounts by numeric value in any format ("$180,000", "180k", "one hundred eighty thousand").
// Shared by private_leak (outgoing text) and provider_minimum (provider-bound payloads).

/** Numbers below this are too common to treat as a leak ("3 units", "24/7"). */
const MIN_SIGNIFICANT_AMOUNT = 100;
/** Shorter values would match by accident. */
const MIN_TEXT_LENGTH = 4;

function compact(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export interface PreparedText {
  compact: string;
  amounts: number[];
}

export function prepareText(texts: string[]): PreparedText {
  const joined = texts.join("\n");
  return { compact: compact(joined), amounts: extractAmounts(joined) };
}

export function factAppearsIn(fact: FactSnapshot, text: PreparedText): boolean {
  const value = compact(fact.value);
  if (value.length >= MIN_TEXT_LENGTH && text.compact.includes(value)) return true;
  const secretAmounts = extractAmounts(fact.value).filter((amount) => Math.abs(amount) >= MIN_SIGNIFICANT_AMOUNT);
  return secretAmounts.some((secret) => text.amounts.some((amount) => sameAmount(secret, amount)));
}

/** Every string inside a payload, for scanning provider-bound requests. */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

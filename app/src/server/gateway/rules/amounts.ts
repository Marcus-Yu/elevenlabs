// Finds the numeric amounts written in a piece of text, whatever the format:
// "$180,000", "180000", "180 000", "180k", "180K", "$0.18M", "180 thousand", "USD 180,000.00",
// "one hundred eighty thousand". Used by private_leak to compare numbers, not strings.

const SCALE_SUFFIX: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  mil: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

// 1–3 digits with comma or single-space thousands groups, or a plain digit run; optional
// decimals; optional scale word. The lookbehind stops a match starting inside another number.
const DIGIT_AMOUNT =
  /(?<![\d.,])(\d{1,3}(?:(?:,| | | )\d{3})+|\d+)(?:\.(\d+))?(?:\s*(k|thousand|mm|mn|mil|million|m|bn|billion|b)\b)?/gi;

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const MULTIPLIERS: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };

export function extractAmounts(text: string): number[] {
  return [...digitAmounts(text), ...wordAmounts(text)];
}

function digitAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(DIGIT_AMOUNT)) {
    const whole = match[1]!.replace(/[,\s  ]/g, "");
    const value = Number(match[2] ? `${whole}.${match[2]}` : whole);
    const scale = match[3] ? SCALE_SUFFIX[match[3].toLowerCase()]! : 1;
    if (Number.isFinite(value)) amounts.push(value * scale);
  }
  return amounts;
}

/** Parses runs of English number words, e.g. "one hundred and eighty thousand". */
function wordAmounts(text: string): number[] {
  const amounts: number[] = [];
  const tokens = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let inNumber = false;
  const flush = () => {
    if (inNumber) amounts.push(total + current);
    total = 0;
    current = 0;
    inNumber = false;
  };
  for (const token of tokens) {
    if (token in UNITS) {
      current += UNITS[token]!;
      inNumber = true;
    } else if (token === "hundred" && inNumber) {
      current *= 100;
    } else if (token in MULTIPLIERS && inNumber) {
      total += current * MULTIPLIERS[token]!;
      current = 0;
    } else if (token === "and" && inNumber) {
      continue;
    } else {
      flush();
    }
  }
  flush();
  return amounts;
}

/** Equal within 0.5%, so "$0.18M" matches "$180,000" but "$181,000" does not. */
export function sameAmount(a: number, b: number): boolean {
  if (a === b) return true;
  return Math.abs(a - b) <= Math.max(Math.abs(a), Math.abs(b)) * 0.005;
}

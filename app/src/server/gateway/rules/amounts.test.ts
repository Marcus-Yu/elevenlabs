import { describe, expect, it } from "vitest";
import { extractAmounts, sameAmount } from "./amounts";

describe("extractAmounts", () => {
  it.each([
    ["$180,000", 180000],
    ["180000", 180000],
    ["180 000", 180000],
    ["180k", 180000],
    ["180K", 180000],
    ["$0.18M", 180000],
    ["USD 180,000.00", 180000],
    ["180 thousand", 180000],
    ["one hundred eighty thousand", 180000],
    ["one hundred and eighty thousand", 180000],
    ["$1.2bn", 1.2e9],
  ])("reads %s as %d", (text, value) => {
    expect(extractAmounts(text).some((amount) => sameAmount(amount, value))).toBe(true);
  });

  it("does not join separate numbers", () => {
    expect(extractAmounts("in 2026 100 units")).not.toContain(2026100);
  });

  it("compares within 0.5%", () => {
    expect(sameAmount(180000, 180500)).toBe(true);
    expect(sameAmount(180000, 181000)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { introDraft, matchRationale } from "./matchDemo";

describe("matchDemo", () => {
  it("builds a deterministic rationale from shared keywords", () => {
    expect(matchRationale({ role: "Robotics hiring, warehouse picking" }, { seeking: "robotics role, picking" })).toBe(
      "Rule-based match: both cards mention robotics, picking.",
    );
  });
  it("only includes revealed fields in the intro draft", () => {
    const text = introDraft({ name: "A" }, { name: "B", email: "b@example.invalid" });
    expect(text).toContain("B email: b@example.invalid");
    expect(text).not.toContain("company");
  });
});

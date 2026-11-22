import { describe, expect, it } from "vitest";
import { ruleInput } from "../testing/ruleInput";
import { individuals } from "./individuals";
import { optInOnly } from "./optInOnly";

describe("opt_in_only", () => {
  it("denies email reveals and outreach on hire goals", () => {
    expect(optInOnly.check(ruleInput("contact.reveal_email", { goal: { kind: "hire" } }))).toMatch(/card\.reveal/);
    expect(optInOnly.check(ruleInput("outreach.send", { goal: { kind: "hire" } }))).toMatch(/hire goals/);
  });

  it("denies contacting a person found by research for a hire goal, from any goal", () => {
    expect(optInOnly.check(ruleInput("outreach.send", { goal: { kind: "customers" }, researchedPerson: true }))).toMatch(/found by research/);
    expect(optInOnly.check(ruleInput("contact.reveal_email", { goal: { kind: "manufacturer" }, researchedPerson: true }))).toMatch(/found by research/);
  });

  it("allows business outreach on other goals and research actions on hire goals", () => {
    expect(optInOnly.check(ruleInput("outreach.send", { goal: { kind: "customers" } }))).toBeNull();
    expect(optInOnly.check(ruleInput("contact.search", { goal: { kind: "hire" } }))).toBeNull();
    expect(optInOnly.check(ruleInput("card.reveal", { goal: { kind: "hire" } }))).toBeNull();
  });

  it("leaves people search open for hire goals (individuals only blocks intern goals)", () => {
    expect(individuals.check(ruleInput("contact.search", { goal: { kind: "hire" } }))).toBeNull();
  });
});

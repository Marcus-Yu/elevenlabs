import { describe, expect, it } from "vitest";
import type { FactSnapshot } from "../store";
import { ruleInput } from "../testing/ruleInput";
import { resolveAllow } from "./allow";
import { allowedForMatching, describeStripped, stripCardFields } from "./cardFields";

const role: FactSnapshot = { id: "fact_role", key: "open_role", value: "Robotics engineer", sensitivity: "public", allowedPurposes: ["matching"] };
const region: FactSnapshot = { id: "fact_region", key: "hq", value: "Pittsburgh, PA", sensitivity: "public", allowedPurposes: ["card.publish", "draft.create"] };
const stage: FactSnapshot = { id: "fact_stage", key: "stage", value: "Seed stage, 14 employees", sensitivity: "shareable", allowedPurposes: ["draft.create"] };
const salary: FactSnapshot = { id: "fact_salary", key: "salary_ceiling", value: "$185,000", sensitivity: "private", allowedPurposes: ["matching"] };
const facts = [role, region, stage, salary];

const card = (fields: Record<string, string>, fieldFacts: Record<string, string[]> = {}) => ({ cardId: "card_1", fields, fieldFacts });

describe("allowedForMatching", () => {
  it("allows non-private facts that list matching or card.publish", () => {
    expect(allowedForMatching(role)).toBe(true);
    expect(allowedForMatching(region)).toBe(true);
    expect(allowedForMatching(stage)).toBe(false);
  });
  it("never allows a private fact, whatever its purposes say", () => {
    expect(allowedForMatching(salary)).toBe(false);
  });
});

describe("stripCardFields", () => {
  it("keeps fields built from facts allowed for matching", () => {
    const result = stripCardFields(card({ need: "Robotics engineer", region: "Pittsburgh, PA" }, { need: ["fact_role"], region: ["fact_region"] }), facts);
    expect(result.stripped).toEqual([]);
    expect(result.payload.fields).toEqual({ need: "Robotics engineer", region: "Pittsburgh, PA" });
  });

  it("drops a field declared from a private or non-matching fact", () => {
    const result = stripCardFields(
      card({ need: "Robotics engineer", comp: "Up to $185k", stage: "Seed" }, { need: ["fact_role"], comp: ["fact_salary"], stage: ["fact_stage"] }),
      facts,
    );
    expect(result.payload.fields).toEqual({ need: "Robotics engineer" });
    expect(result.payload.fieldFacts).toEqual({ need: ["fact_role"] });
    expect(result.stripped).toEqual([
      { field: "comp", factKey: "salary_ceiling", why: "declared_fact_not_allowed" },
      { field: "stage", factKey: "stage", why: "declared_fact_not_allowed" },
    ]);
  });

  it("drops a field whose text holds a disallowed fact's value even when undeclared", () => {
    const result = stripCardFields(card({ need: "Robotics engineer", note: "budget around 185 thousand" }), facts);
    expect(result.stripped).toEqual([{ field: "note", factKey: "salary_ceiling", why: "fact_value_in_text" }]);
  });

  it("drops a field that declares a fact the user doesn't have", () => {
    const result = stripCardFields(card({ need: "x" }, { need: ["fact_elsewhere"] }), facts);
    expect(result.stripped).toEqual([{ field: "need", factKey: null, why: "unknown_fact" }]);
  });

  it("describes stripped fields for the log", () => {
    expect(describeStripped([{ field: "comp", factKey: "salary_ceiling", why: "declared_fact_not_allowed" }])).toBe(
      'card_fields: stripped "comp" (fact "salary_ceiling": declared_fact_not_allowed) as not allowed for matching',
    );
  });
});

describe("card_fields in the allow step", () => {
  it("allows with card_fields when something was stripped and fields remain", () => {
    const input = ruleInput("card.publish", {
      request: { payload: card({ need: "Robotics engineer" }) },
      strippedFields: [{ field: "comp", factKey: "salary_ceiling", why: "declared_fact_not_allowed" }],
    });
    expect(resolveAllow(input)).toMatchObject({ ok: true, ruleId: "card_fields", reason: expect.stringContaining("salary_ceiling") });
  });
  it("denies when every field was stripped", () => {
    const input = ruleInput("card.publish", {
      request: { payload: card({}) },
      strippedFields: [{ field: "comp", factKey: "salary_ceiling", why: "declared_fact_not_allowed" }],
    });
    expect(resolveAllow(input)).toMatchObject({ ok: false, ruleId: "card_fields" });
  });
  it("uses default when nothing was stripped", () => {
    expect(resolveAllow(ruleInput("card.publish", { request: { payload: card({ need: "x" }) } }))).toMatchObject({ ok: true, ruleId: "default" });
  });
});

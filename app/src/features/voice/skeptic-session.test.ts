import { describe, expect, it } from "vitest";
import type { UntrustedText } from "../../shared/contracts/discovery";
import { appendTranscriptEntry, skepticDynamicVariables, type SkepticContext } from "./skeptic-session";

const text = (value: string): UntrustedText => ({
  kind: "untrusted", text: value, flagged: false,
  source: { provider: "web", url: "https://example.com", fetchedAt: "2026-01-01", claim: "fixture" },
});
const context: SkepticContext = {
  persona: { id: "p1", segment: "ops", label: "Operations lead", role: "VP Operations",
    companyDomain: "example.com", traits: { priority: "cost" }, sources: [] },
  companyType: text("Logistics company"),
  score: { personaId: "p1", segmentIndex: 3, interest: 2, objection: "The price is unclear." },
  weakSegment: { index: 2, text: text("We will save you money.") },
  objection: text("The price is unclear."), pitchSummary: text("A cost saving service."),
};

describe("skepticDynamicVariables", () => {
  it("carries the scored objection and weak sentence as untrusted data", () => {
    const vars = skepticDynamicVariables(context);
    expect(vars.objection).toEqual(context.objection);
    expect(vars.weak_sentence).toEqual(context.weakSegment.text);
    expect(vars.persona.role).toBe("VP Operations");
  });
  it("rejects mismatched or absent scored evidence", () => {
    expect(() => skepticDynamicVariables({ ...context, score: { ...context.score, personaId: "other" } })).toThrow();
    expect(() => skepticDynamicVariables({ ...context, objection: text("Invented objection") })).toThrow();
    expect(() => skepticDynamicVariables({ ...context, score: { ...context.score, objection: undefined } })).toThrow();
  });
});

describe("appendTranscriptEntry", () => {
  it("appends final turns without mutating state and deduplicates retries", () => {
    const entry = { id: "one", role: "agent" as const, content: text("Why is that?") };
    const original = [];
    const first = appendTranscriptEntry(original, entry);
    expect(original).toEqual([]);
    expect(appendTranscriptEntry(first, entry)).toEqual([entry]);
    expect(() => appendTranscriptEntry(first, { ...entry, content: text("Different") })).toThrow();
  });
});

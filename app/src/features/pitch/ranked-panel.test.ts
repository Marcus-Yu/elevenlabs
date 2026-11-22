import { expect, it } from "vitest";
import { panelForRankedMatches } from "./ranked-panel";

const matches = ["first", "second", "third"].map((name) => ({
  company: { name, domain: `${name}.example` },
  sources: [{
    provider: "fiber" as const,
    fetchedAt: new Date("2026-11-22T00:00:00Z"),
    url: `https://${name}.example`,
    claim: `name: ${name}; domain: ${name}.example`,
  }],
}));

it("preserves rank and produces a sourced archetype for each supported segment", () => {
  const panel = panelForRankedMatches(matches);
  expect(panel.complete).toBe(true);
  expect(panel.personas).toHaveLength(9);
  expect(panel.personas[0]).toMatchObject({ companyDomain: "first.example", traits: { company: "first" } });
});

it("does not infer company evidence from an unrelated source", () => {
  const panel = panelForRankedMatches([
    ...matches.slice(0, 2),
    { ...matches[2], sources: [{ ...matches[2].sources[0], claim: "Contact title: Director" }] },
  ]);
  expect(panel.complete).toBe(false);
  expect(panel.personas).toHaveLength(6);
});

it("uses only the ranking evidence that was persisted with the match", () => {
  const panel = panelForRankedMatches(matches.map((match) => ({
    ...match, sources: [{ ...match.sources[0], claim: "headcount: 500" }],
  })));
  expect(panel.complete).toBe(true);
  expect(panel.personas[0].traits).toEqual({ headcount: "500" });
});

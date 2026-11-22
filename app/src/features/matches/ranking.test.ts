import { describe, expect, it } from "vitest";
import type { CompanyRecord } from "../../shared/contracts";
import { rankCompanies, type RankingCriteria } from "./ranking";

// Synthetic companies shaped like WP2's Fiber CompanyRecords (one SourceRef per populated field).
function company(domain: string, opts: { industry?: string; head?: number; description?: string }): CompanyRecord {
  const url = `https://www.linkedin.com/company/${domain.split(".")[0]}`;
  const s = (claim: string) => ({ provider: "fiber" as const, url, fetchedAt: "2026-11-22T00:00:00.000Z", claim });
  const sources = [s(`name: ${domain}; domain: ${domain}`)];
  if (opts.description) sources.push(s(`description: ${opts.description}`));
  if (opts.industry) sources.push(s(`industry: ${opts.industry}`));
  if (opts.head) sources.push(s(`headcount: about ${opts.head}`));
  return {
    domain,
    name: domain,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.industry ? { industry: opts.industry } : {}),
    ...(opts.head ? { headcount: { min: opts.head, max: opts.head } } : {}),
    sources,
  };
}

const criteria: RankingCriteria = { industries: ["Logistics"], keywords: ["3PL", "warehouse"], employeeCount: { min: 101, max: 1000 } };
const companies = [
  company("big3pl.com", { industry: "Logistics", head: 800, description: "A national 3PL running 20 warehouse sites." }),
  company("mid3pl.com", { industry: "Logistics", head: 250, description: "Regional 3PL and fulfillment." }),
  company("small3pl.com", { industry: "Logistics", head: 120, description: "Boutique 3PL warehouse." }),
  company("tiny3pl.com", { industry: "Logistics", head: 105, description: "Local 3PL." }),
  company("software.com", { industry: "Software", head: 300, description: "Warehouse management software." }),
  company("nosource.com", { industry: "Logistics", head: 300 }),
];
companies[5]!.sources = [];

describe("rankCompanies", () => {
  it("ranks by sourced fit and cites the source behind every point", () => {
    const ranked = rankCompanies({ companies, criteria });
    expect(ranked.map((r) => r.company.domain)).toEqual(["big3pl.com", "small3pl.com", "mid3pl.com", "tiny3pl.com", "software.com"]);
    for (const r of ranked) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.method).toBe("rules-v1");
      for (const reason of r.reasons) expect(reason.source, reason.text).toBeDefined();
      expect(r.citedSources.length).toBeGreaterThan(0);
      expect(r.rationale).toMatch(/Rule-based ranking/);
    }
    const software = ranked.find((r) => r.company.domain === "software.com")!;
    expect(software.rationale).toContain("Against: Industry Software is outside the target");
  });

  it("drops companies without sources instead of ranking them", () => {
    expect(rankCompanies({ companies, criteria }).some((r) => r.company.domain === "nosource.com")).toBe(false);
  });

  it("drops rejected and already-matched companies", () => {
    const ranked = rankCompanies({ companies, criteria, rejections: [{ company: companies[0]!, reason: "competitor" }], existingDomains: ["mid3pl.com"] });
    expect(ranked.map((r) => r.company.domain)).not.toContain("big3pl.com");
    expect(ranked.map((r) => r.company.domain)).not.toContain("mid3pl.com");
  });

  it("WP5 acceptance: two rejections for the same reason change the next ranking", () => {
    const before = rankCompanies({ companies, criteria }).map((r) => r.company.domain);
    expect(before.indexOf("small3pl.com")).toBeLessThan(before.indexOf("software.com"));

    // One rejection only removes that company; nothing is learned yet.
    const one = rankCompanies({ companies, criteria, rejections: [{ company: companies[3]!, reason: "Too small for a pilot" }] });
    expect(one.find((r) => r.company.domain === "small3pl.com")!.reasons.some((x) => x.text.includes("too small"))).toBe(false);

    const rejectedToo = company("tiny2.com", { industry: "Logistics", head: 115, description: "3PL" });
    const similar = company("small2.com", { industry: "Logistics", head: 110, description: "3PL warehouse" });
    const pool = [...companies, rejectedToo, similar];
    const unlearned = rankCompanies({ companies: pool, criteria }).map((r) => r.company.domain);
    expect(unlearned.indexOf("small2.com")).toBeLessThan(unlearned.indexOf("software.com"));

    const after = rankCompanies({
      companies: pool,
      criteria,
      rejections: [
        { company: companies[3]!, reason: "Too small for a pilot" },
        { company: rejectedToo, reason: "too small" },
      ],
    });
    // A company no bigger than the ones rejected as too small is pushed down...
    const small2 = after.find((r) => r.company.domain === "small2.com")!;
    expect(small2.reasons.find((x) => x.points < 0)!.text).toBe("You rejected 2 companies of this size as too small");
    const order = after.map((r) => r.company.domain);
    expect(order.indexOf("small2.com")).toBeGreaterThan(order.indexOf("software.com"));
    // ...while a bigger one (120 > 115) is not.
    expect(after.find((r) => r.company.domain === "small3pl.com")!.reasons.every((x) => x.points >= 0)).toBe(true);
  });

  it("learns a non-size reason only when it repeats for the same industry", () => {
    const sw2 = company("software2.com", { industry: "Software", head: 400, description: "WMS" });
    const sw3 = company("software3.com", { industry: "Software", head: 400, description: "WMS" });
    const ranked = rankCompanies({
      companies,
      criteria,
      rejections: [
        { company: sw2, reason: "Not a buyer, they sell software" },
        { company: sw3, reason: "not a buyer - they sell software!" },
      ],
    });
    const software = ranked.find((r) => r.company.domain === "software.com")!;
    expect(software.reasons.some((x) => x.points === -15 && x.text.startsWith("You rejected 2 Software companies"))).toBe(true);
  });
});

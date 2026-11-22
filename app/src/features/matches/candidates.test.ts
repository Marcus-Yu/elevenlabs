import { describe, expect, it } from "vitest";
import { createDiscoveryHandlersFromEnv } from "../../server/gateway/handlers/discovery";
import { DEMO_CANDIDATE_SEARCH, DEMO_HIRE_CRITERIA } from "../../server/gateway/handlers/discovery.demo";
import {
  applyCriteriaChange,
  candidateQueryFor,
  evaluateShortlist,
  hasSkill,
  HireCriteria,
  proposeCriteriaChange,
  rankCandidates,
  type Candidate,
} from "./candidates";

// Synthetic candidates for the unit tests; the acceptance test below uses the recorded Fiber pool.
function cand(name: string, years: number | undefined, skills: string[], title = "Robotics Engineer"): Candidate {
  const url = `https://www.linkedin.com/in/${name.toLowerCase().replace(/\s/g, "-")}`;
  const s = (claim: string) => ({ provider: "fiber" as const, url, fetchedAt: "2026-11-22T00:00:00.000Z", claim });
  return {
    fullName: name,
    title,
    linkedinUrl: url,
    ...(years !== undefined ? { yearsExperience: years } : {}),
    skills,
    sources: [s(`role: ${title}`), ...(years !== undefined ? [s(`experience: about ${years} years`)] : []), ...(skills.length ? [s(`skills: ${skills.join(", ")}`)] : [])],
  };
}

const criteria = HireCriteria.parse({ role: "Robotics engineer", titles: ["robotics engineer"], mustHaveSkills: ["ROS", "C++"], niceToHaveSkills: ["Python"], minYearsExperience: 2 });

describe("skills", () => {
  it("matches LinkedIn labels and aliases without false positives", () => {
    expect(hasSkill(["Robot Operating System (ROS)"], "ROS")).toBe(true);
    expect(hasSkill(["ROS2"], "ROS")).toBe(true);
    expect(hasSkill(["C++"], "C++")).toBe(true);
    expect(hasSkill(["C"], "C++")).toBe(false);
    expect(hasSkill(["Cross-functional teams"], "ROS")).toBe(false);
    expect(hasSkill(["Microsoft Windows"], "ROS")).toBe(false);
  });
});

describe("rankCandidates", () => {
  it("ranks by sourced fit, cites the profile behind each point, and flags must-haves", () => {
    const ranked = rankCandidates({
      candidates: [cand("Ada", 6, ["ROS", "C++", "Python"]), cand("Bo", 1, ["ROS", "C++"]), cand("Cy", 5, ["Python"]), cand("Di", undefined, ["ROS", "C++"])],
      criteria,
    });
    expect(ranked.map((r) => r.candidate.fullName)).toEqual(["Ada", "Di", "Bo", "Cy"]);
    expect(ranked[0]!.meetsMustHaves).toBe(true);
    expect(ranked.find((r) => r.candidate.fullName === "Bo")!.rationale).toContain("below the 2-year minimum");
    expect(ranked.find((r) => r.candidate.fullName === "Cy")!.meetsMustHaves).toBe(false);
    for (const r of ranked) for (const reason of r.reasons) expect(reason.source, reason.text).toBeDefined();
    expect(ranked.every((r) => r.score <= 100 && r.score >= 0)).toBe(true);
  });

  it("drops rejected and duplicate profiles", () => {
    const ada = cand("Ada", 6, ["ROS", "C++"]);
    const ranked = rankCandidates({ candidates: [ada, ada, cand("Bo", 3, ["ROS", "C++"])], criteria, rejectedUrls: [ada.linkedinUrl!] });
    expect(ranked.map((r) => r.candidate.fullName)).toEqual(["Bo"]);
  });

  it("builds the people-search request from the criteria", () => {
    expect(candidateQueryFor({ ...criteria, countryCodes: ["USA"] })).toEqual({ titles: ["robotics engineer"], skills: ["ROS", "C++"], minYearsExperience: 2, countryCodes: ["USA"], pageSize: 15 });
  });
});

describe("rejection → proposed criteria change", () => {
  it("never names the rejected person, for any kind of change", () => {
    const named = cand("Zelda Quartermaine", 14, ["ROS", "C++"], "Embedded Robotics Engineer");
    for (const reason of ["too junior", "too senior", "no SLAM"]) {
      const change = proposeCriteriaChange({ ...criteria, minYearsExperience: 20 }, named, reason) ?? proposeCriteriaChange(criteria, named, reason);
      if (change) expect(JSON.stringify(change)).not.toMatch(/Zelda|Quartermaine/);
    }
    expect(proposeCriteriaChange(criteria, named, "too senior")!.explanation).toBe("You rejected an Embedded Robotics Engineer (about 14 years) as too senior. Cap experience at 13 years?");
  });

  it("proposes a higher minimum for 'too junior' and never applies it by itself", () => {
    const change = proposeCriteriaChange(criteria, cand("Bo", 3.4, ["ROS", "C++"]), "Too junior for a founding role");
    expect(change).toMatchObject({ changes: [{ field: "minYearsExperience", from: 2, to: 4 }], basedOn: { candidate: "a Robotics Engineer", reason: "Too junior for a founding role" } });
    expect(change!.explanation).toBe("You rejected a Robotics Engineer (about 3.4 years) as too junior. Raise the minimum to 4 years?");
    // Real people are never named on the card or in anything sent to the client.
    expect(JSON.stringify(change)).not.toContain("Bo");
    expect(criteria.minYearsExperience).toBe(2);
    expect(applyCriteriaChange(criteria, change!).minYearsExperience).toBe(4);
  });

  it("proposes a must-have for a missing skill, a cap for 'too senior', and nothing for an unclear reason", () => {
    expect(proposeCriteriaChange(criteria, cand("Ed", 5, ["ROS", "C++"]), "no SLAM experience")!.changes[0]).toEqual({ field: "mustHaveSkills", from: ["ROS", "C++"], to: ["ROS", "C++", "SLAM experience"] });
    expect(proposeCriteriaChange(criteria, cand("Fi", 14, ["ROS", "C++"]), "too senior for this budget")!.changes[0]).toMatchObject({ field: "maxYearsExperience", to: 13 });
    expect(proposeCriteriaChange(criteria, cand("Gu", 5, ["ROS", "C++"]), "not a fit")).toBeNull();
  });
});

describe("WP5 hire acceptance on the recorded Fiber pool (replay)", () => {
  it("reject one as too junior → confirm the change → the rerun's shortlist fits better", async () => {
    const handlers = createDiscoveryHandlersFromEnv({ ADAPTER_MODE: "replay" });
    const search = await handlers["contact.search"].run(DEMO_CANDIDATE_SEARCH, { userId: "orrery-hiring-manager", goalId: "hire-1" });
    expect(search.logReason).toBe("ploid_not_configured_used_fiber");
    if (!("candidates" in search.data)) throw new Error("expected candidates");
    const pool = search.data.candidates;
    expect(pool.length).toBeGreaterThanOrEqual(10);
    for (const c of pool) expect(c).not.toHaveProperty("email");

    const first = rankCandidates({ candidates: pool, criteria: DEMO_HIRE_CRITERIA });
    // The demo's rejection: the most junior candidate in the top five.
    const junior = first.slice(0, 5).filter((r) => r.candidate.yearsExperience !== undefined).sort((a, b) => a.candidate.yearsExperience! - b.candidate.yearsExperience!)[0]!.candidate;
    const change = proposeCriteriaChange(DEMO_HIRE_CRITERIA, junior, "too junior")!;
    expect(change.changes[0]!.field).toBe("minYearsExperience");

    const confirmed = applyCriteriaChange(DEMO_HIRE_CRITERIA, change); // preference_confirm
    const rerun = rankCandidates({ candidates: pool, criteria: confirmed, rejectedUrls: [junior.linkedinUrl!] });

    const before = evaluateShortlist(first, confirmed);
    const after = evaluateShortlist(rerun, confirmed);
    expect(after.fitAtK).toBeGreaterThan(before.fitAtK);
    expect(rerun.slice(0, 5).every((r) => (r.candidate.yearsExperience ?? 0) >= (change.changes[0]!.to as number))).toBe(true);
    expect(rerun.map((r) => r.candidate.linkedinUrl)).not.toContain(junior.linkedinUrl);
  });
});

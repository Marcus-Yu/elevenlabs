import type { z } from "zod";
import { candidateQueryFor, HireCriteria } from "../../../features/matches/candidates";
import type { CompanySearchPayload, ContactSearchPayload, JobsSearchPayload, WebReadPayload } from "./discovery";

// The demo goal's discovery requests (robotics startup, docs/IMPLEMENTATION_PLAN.md §12).
// Recorded once by scripts/record-discovery-fixtures.ts; replay only hits when a request matches
// one of these exactly, so the goal pipeline (WP5) should use these for the demo goals.

export const DEMO_CUSTOMER_SEARCH: z.infer<typeof CompanySearchPayload> = {
  industries: ["Logistics"],
  keywords: ["warehouse", "fulfillment", "3PL"],
  countryCodes: ["USA"],
  employeeCount: { min: 101, max: 1000 },
  pageSize: 10,
};

export const DEMO_MANUFACTURER_SEARCH: z.infer<typeof CompanySearchPayload> = {
  industries: ["Manufacturing"],
  keywords: ["contract manufacturing", "injection molding", "CNC machining"],
  countryCodes: ["USA"],
  employeeCount: { min: 11, max: 500 },
  pageSize: 10,
};

export const DEMO_CONTACT_ROLES = ["operations", "supply chain", "fulfillment"];

export const DEMO_JOB_SEARCH: z.infer<typeof JobsSearchPayload> = {
  titles: ["robotics engineer"],
  countryCodes: ["USA"],
  pageSize: 5,
};

export const DEMO_WEB_READ: z.infer<typeof WebReadPayload> = { url: "https://locusrobotics.com/" };

export function demoContactSearch(company: { domain: string; name: string }): z.infer<typeof ContactSearchPayload> {
  return { companyDomain: company.domain, companyName: company.name, roles: DEMO_CONTACT_ROLES, limit: 3 };
}

// ---------- hire goal (scope change 2026-11-22): Orrery Robotics needs a robotics engineer ----------

/** Stand-in for WP3's approved /calibrate/criteria output until person-3 publishes a sample. */
export const DEMO_HIRE_CRITERIA: HireCriteria = HireCriteria.parse({
  role: "Robotics engineer",
  titles: ["robotics engineer", "robotics software engineer"],
  mustHaveSkills: ["ROS", "C++"],
  niceToHaveSkills: ["Python", "motion planning", "computer vision", "SLAM"],
  minYearsExperience: 2,
  countryCodes: ["USA"],
});

export const DEMO_CANDIDATE_SEARCH = { mode: "criteria" as const, ...candidateQueryFor(DEMO_HIRE_CRITERIA) };

/** The research brief's per-title agent searches (watchApi.buildResearchBrief), one per title. */
export const DEMO_RESEARCH_AGENT_SEARCHES = DEMO_HIRE_CRITERIA.titles.map((title) => ({ mode: "criteria" as const, ...candidateQueryFor({ ...DEMO_HIRE_CRITERIA, titles: [title] }) }));

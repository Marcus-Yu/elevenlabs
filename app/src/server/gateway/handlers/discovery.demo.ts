import type { z } from "zod";
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

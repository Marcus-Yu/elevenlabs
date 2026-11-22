import { page, route, type Spec } from "@wasp.sh/spec";
import { BriefingPage } from "./BriefingPage" with { type: "ref" };

// Wasp declarations for the "briefing" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const briefingSpec: Spec = [
  route("BriefingRoute", "/", page(BriefingPage, { authRequired: true })),
];

import { page, route, type Spec } from "@wasp.sh/spec";
import { ActivityPage } from "./ActivityPage" with { type: "ref" };

// Wasp declarations for the "activity" feature: routes, pages, queries, actions, apis and jobs.
// The owning work package adds entries here; main.wasp.ts already includes this spec.
export const activitySpec: Spec = [
  route("ActivityRoute", "/activity", page(ActivityPage, { authRequired: true })),
];

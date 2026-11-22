import { page, query, route, type Spec } from "@wasp.sh/spec";
import { ActivityPage } from "./ActivityPage" with { type: "ref" };
import { getActivityLog } from "./operations" with { type: "ref" };

// Wasp declarations for the "activity" feature: routes, pages, queries, actions, apis and jobs.
// WP1 declares the queries; WP6 adds routes and pages.
export const activitySpec: Spec = [
  route("ActivityRoute", "/activity", page(ActivityPage, { authRequired: true })),
  query(getActivityLog, { entities: ["ActionLog"] }),
];
